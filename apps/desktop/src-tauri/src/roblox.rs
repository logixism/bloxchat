use anyhow::{Context, Result};
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use regex::Regex;
use std::ffi::OsString;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::os::windows::ffi::OsStringExt;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, LazyLock, Mutex};
use tauri::{AppHandle, Manager};
use windows::Win32::Foundation::{HWND, MAX_PATH};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, GetForegroundWindow, GetWindowThreadProcessId, IsIconic, SetForegroundWindow,
    ShowWindow, SW_RESTORE,
};
use windows_strings::PCWSTR;

pub(crate) struct LogSettingsState {
    pub(crate) logs_path: Mutex<PathBuf>,
    pub(crate) watcher_control: Mutex<Option<mpsc::Sender<PathBuf>>>,
}

const DEFAULT_JOB_ID: &str = "global";
static JOIN_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"Joining game '([a-f0-9-]+)'").expect("valid join regex"));
static LEAVE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"Disconnect from game|leaveGameInternal|leaveUGCGameInternal")
        .expect("valid leave regex")
});

pub(crate) fn default_roblox_logs_path() -> PathBuf {
    let mut path = home::home_dir().expect("Could not find home dir");
    path.push("AppData\\Local\\Roblox\\logs");
    path
}

pub(crate) fn get_roblox_logs_path(state: &LogSettingsState) -> Result<PathBuf> {
    Ok(state
        .logs_path
        .lock()
        .map_err(|err| anyhow::anyhow!("lock logs_path: {err}"))?
        .clone())
}

pub(crate) fn set_roblox_logs_path(state: &LogSettingsState, path: &str) -> Result<PathBuf> {
    let next_path = validate_logs_path(path)?;

    {
        let mut current = state
            .logs_path
            .lock()
            .map_err(|err| anyhow::anyhow!("lock logs_path: {err}"))?;
        *current = next_path.clone();
    }

    if let Some(tx) = state
        .watcher_control
        .lock()
        .map_err(|err| anyhow::anyhow!("lock watcher_control: {err}"))?
        .as_ref()
    {
        let _ = tx.send(next_path.clone());
    }

    Ok(next_path)
}

fn validate_logs_path(path: &str) -> Result<PathBuf> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        anyhow::bail!("Path cannot be empty");
    }

    let next_path = PathBuf::from(trimmed);
    if !next_path.is_dir() {
        anyhow::bail!("Path must be an existing directory");
    }

    Ok(next_path)
}

pub(crate) fn get_job_id(state: &LogSettingsState) -> Result<String> {
    let logs_path = state
        .logs_path
        .lock()
        .map_err(|err| anyhow::anyhow!("lock logs_path: {err}"))?
        .clone();
    Ok(job_id_from_logs_dir(&logs_path))
}

fn job_id_from_logs_dir(logs_dir: &Path) -> String {
    let Some(latest_log) = latest_player_log(logs_dir) else {
        return DEFAULT_JOB_ID.to_string();
    };

    let Ok(mut file) = File::open(latest_log) else {
        return DEFAULT_JOB_ID.to_string();
    };

    job_id_from_file_tail(&mut file).unwrap_or_else(|_| DEFAULT_JOB_ID.to_string())
}

fn latest_player_log(logs_dir: &Path) -> Option<PathBuf> {
    std::fs::read_dir(logs_dir).ok().and_then(|entries| {
        entries
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .filter(|path| path.to_string_lossy().contains("_Player"))
            .max_by_key(|path| path.metadata().and_then(|m| m.modified()).ok())
    })
}

fn job_id_from_file_tail(file: &mut File) -> Result<String> {
    let len = file.metadata().context("stat log file")?.len();
    if len == 0 {
        return Ok(DEFAULT_JOB_ID.to_string());
    }

    const INITIAL_WINDOW: u64 = 256 * 1024;
    const MAX_WINDOW: u64 = 8 * 1024 * 1024;

    let mut window = INITIAL_WINDOW.min(len);
    loop {
        let start = len.saturating_sub(window);
        file.seek(SeekFrom::Start(start))
            .context("seek log file tail")?;

        let mut bytes = Vec::with_capacity((len - start) as usize);
        file.read_to_end(&mut bytes).context("read log tail")?;

        let text = String::from_utf8_lossy(&bytes);
        if let Some(job_id) = job_id_from_text_slice(&text) {
            return Ok(job_id);
        }

        if start == 0 || window >= MAX_WINDOW {
            break;
        }
        window = (window * 2).min(MAX_WINDOW).min(len);
    }

    file.seek(SeekFrom::Start(0))
        .context("seek log file start")?;

    let mut current = DEFAULT_JOB_ID.to_string();
    for line in BufReader::new(file).lines().flatten() {
        if let Some(caps) = JOIN_RE.captures(&line) {
            current = caps[1].to_string();
        } else if LEAVE_RE.is_match(&line) {
            current = DEFAULT_JOB_ID.to_string();
        }
    }

    Ok(current)
}

fn job_id_from_text_slice(text: &str) -> Option<String> {
    let last_join = JOIN_RE
        .captures_iter(text)
        .filter_map(|caps| {
            let m = caps.get(0)?;
            let id = caps.get(1)?.as_str().to_string();
            Some((m.start(), id))
        })
        .last();

    let last_leave = LEAVE_RE.find_iter(text).map(|m| m.start()).last();

    match (last_join, last_leave) {
        (None, None) => None,
        (Some((_pos, id)), None) => Some(id),
        (None, Some(_pos)) => Some(DEFAULT_JOB_ID.to_string()),
        (Some((join_pos, id)), Some(leave_pos)) => {
            if leave_pos > join_pos {
                Some(DEFAULT_JOB_ID.to_string())
            } else {
                Some(id)
            }
        }
    }
}

pub(crate) fn should_steal_focus(app: AppHandle) -> bool {
    unsafe {
        let hwnd: HWND = GetForegroundWindow();

        if hwnd.0 == std::ptr::null_mut() {
            return false;
        }

        for window in app.webview_windows().values() {
            let win_hwnd = window.hwnd().unwrap();

            if win_hwnd.0 == hwnd.0 {
                return true;
            }
        }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));

        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if handle.is_err() {
            return false;
        }
        let handle = handle.unwrap();

        let mut buffer = [0u16; MAX_PATH as usize];
        let mut size = buffer.len() as u32;

        if QueryFullProcessImageNameW(
            handle,
            windows::Win32::System::Threading::PROCESS_NAME_FORMAT(0),
            windows_strings::PWSTR(&mut buffer[0]),
            &mut size,
        )
        .is_err()
        {
            return false;
        }

        let exe = OsString::from_wide(&buffer[..size as usize])
            .to_string_lossy()
            .to_lowercase();

        exe.contains("robloxplayerbeta.exe")
    }
}

pub(crate) fn focus_roblox() -> bool {
    const CLASS_NAME: &[u16] = &[
        b'R' as u16,
        b'o' as u16,
        b'b' as u16,
        b'l' as u16,
        b'o' as u16,
        b'x' as u16,
        b'A' as u16,
        b'p' as u16,
        b'p' as u16,
        0,
    ];
    const WINDOW_TITLE: &[u16] = &[
        b'R' as u16,
        b'o' as u16,
        b'b' as u16,
        b'l' as u16,
        b'o' as u16,
        b'x' as u16,
        0,
    ];

    unsafe {
        let class_name_pcw = PCWSTR(CLASS_NAME.as_ptr());
        let window_title_pcw = PCWSTR(WINDOW_TITLE.as_ptr());

        let hwnd = FindWindowW(class_name_pcw, PCWSTR::null()).unwrap_or_else(|_| {
            FindWindowW(PCWSTR::null(), window_title_pcw).unwrap_or(HWND(std::ptr::null_mut()))
        });

        if hwnd.0 == std::ptr::null_mut() {
            return false;
        }

        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }

        SetForegroundWindow(hwnd).as_bool()
    }
}

pub(crate) fn start_log_watcher(initial_path: PathBuf, path_updates_rx: mpsc::Receiver<PathBuf>) {
    std::thread::spawn(move || {
        let mut log_dir = initial_path;

        loop {
            let (tx, rx) = mpsc::channel();
            let mut watcher = match RecommendedWatcher::new(
                move |res| {
                    let _ = tx.send(res);
                },
                Config::default().with_poll_interval(std::time::Duration::from_secs(1)),
            ) {
                Ok(w) => w,
                Err(_) => {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    continue;
                }
            };

            if watcher
                .watch(&log_dir, RecursiveMode::NonRecursive)
                .is_err()
            {
                std::thread::sleep(std::time::Duration::from_secs(2));
                if let Ok(next_path) = path_updates_rx.try_recv() {
                    log_dir = next_path;
                }
                continue;
            }

            let mut last_file: Option<PathBuf> = None;
            let mut last_pos: u64 = 0;

            let process_file = |path: &Path, pos: &mut u64| {
                if let Ok(file) = File::open(path) {
                    let mut reader = BufReader::new(file);
                    let _ = reader.seek(SeekFrom::Start(*pos));
                    for _line in reader.by_ref().lines().flatten() {}
                    *pos = reader.get_ref().metadata().map(|m| m.len()).unwrap_or(*pos);
                }
            };

            let mut should_rebuild = false;
            while !should_rebuild {
                if let Ok(next_path) = path_updates_rx.try_recv() {
                    log_dir = next_path;
                    should_rebuild = true;
                    continue;
                }

                match rx.recv_timeout(std::time::Duration::from_millis(500)) {
                    Ok(Ok(event)) => {
                        if event.kind.is_modify() || event.kind.is_create() {
                            if let Some(path) = event.paths.get(0) {
                                if !path.to_string_lossy().contains("_Player") {
                                    continue;
                                }

                                if last_file.as_ref() != Some(path) {
                                    last_file = Some(path.clone());
                                    last_pos = 0;
                                }
                                process_file(path, &mut last_pos);
                            }
                        }
                    }
                    Ok(Err(_)) => {}
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        if let Some(ref path) = last_file {
                            process_file(path, &mut last_pos);
                        }
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn job_id_parsing_prefers_last_event() {
        let join1 = "Joining game 'a1b2c3d4-1111-2222-3333-444455556666'";
        let join2 = "Joining game 'deadbeef-1111-2222-3333-444455556666'";

        let text = format!("{join1}\nblah\n{join2}\n");
        assert_eq!(
            job_id_from_text_slice(&text).unwrap(),
            "deadbeef-1111-2222-3333-444455556666"
        );

        let text = format!("{join1}\nleaveGameInternal\n{join2}\nDisconnect from game\n");
        assert_eq!(job_id_from_text_slice(&text).unwrap(), DEFAULT_JOB_ID);
    }
}
