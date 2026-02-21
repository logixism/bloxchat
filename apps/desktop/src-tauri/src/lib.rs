use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rdev::{listen, Event, EventType};
use regex::Regex;
use std::ffi::OsString;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::os::windows::ffi::OsStringExt;
use std::path::PathBuf;
use std::sync::{mpsc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
#[cfg(desktop)]
use tauri_plugin_deep_link::DeepLinkExt;
use windows::Win32::Foundation::{HWND, MAX_PATH};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, GetForegroundWindow, GetWindowThreadProcessId, IsIconic, SetForegroundWindow,
    ShowWindow, SW_RESTORE,
};
use windows_strings::PCWSTR;

struct LogSettingsState {
    logs_path: Mutex<PathBuf>,
    watcher_control: Mutex<Option<mpsc::Sender<PathBuf>>>,
}

fn default_roblox_logs_path() -> PathBuf {
    let mut path = home::home_dir().expect("Could not find home dir");
    path.push("AppData\\Local\\Roblox\\logs");
    path
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_default_roblox_logs_path() -> String {
    default_roblox_logs_path().to_string_lossy().to_string()
}

#[tauri::command]
fn get_roblox_logs_path(state: tauri::State<LogSettingsState>) -> Result<String, String> {
    let path = state.logs_path.lock().map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn set_roblox_logs_path(
    path: String,
    state: tauri::State<LogSettingsState>,
) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    let next_path = PathBuf::from(trimmed);
    if !next_path.is_dir() {
        return Err("Path must be an existing directory".to_string());
    }

    {
        let mut current = state.logs_path.lock().map_err(|e| e.to_string())?;
        *current = next_path.clone();
    }

    if let Some(tx) = state
        .watcher_control
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
    {
        let _ = tx.send(next_path.clone());
    }

    Ok(next_path.to_string_lossy().to_string())
}

#[tauri::command]
fn should_steal_focus(app: tauri::AppHandle) -> bool {
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

#[tauri::command]
fn focus_roblox() -> bool {
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

#[tauri::command]
async fn is_image(url: String) -> Result<bool, String> {
    let resp = reqwest::Client::new()
        .head(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if let Some(ct) = resp.headers().get("content-type") {
        let ct_str = ct.to_str().map_err(|e| e.to_string())?;
        return Ok(ct_str.starts_with("image/"));
    }
    Ok(false)
}

fn start_log_watcher(
    app: AppHandle,
    initial_path: PathBuf,
    path_updates_rx: mpsc::Receiver<PathBuf>,
) {
    std::thread::spawn(move || {
        let re_join = Regex::new(r"Joining game '([a-f0-9\-]+)'").unwrap();
        let re_leave =
            Regex::new(r"Disconnect from game|leaveGameInternal|leaveUGCGameInternal").unwrap();
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
                Err(e) => {
                    eprintln!("failed to create watcher: {:?}", e);
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    continue;
                }
            };

            if watcher
                .watch(&log_dir, RecursiveMode::NonRecursive)
                .is_err()
            {
                std::thread::sleep(std::time::Duration::from_secs(1));
                if let Ok(next_path) = path_updates_rx.try_recv() {
                    log_dir = next_path;
                }
                continue;
            }

            let mut last_file: Option<PathBuf> = None;
            let mut last_pos: u64 = 0;
            let mut last_job_id: Option<String> = None;

            if let Ok(entries) = std::fs::read_dir(&log_dir) {
                if let Some(latest_file) = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().to_string_lossy().contains("_Player"))
                    .max_by_key(|e| e.metadata().ok().and_then(|m| m.modified().ok()))
                {
                    if let Ok(file) = File::open(latest_file.path()) {
                        let mut reader = BufReader::new(file);
                        for line_result in reader.by_ref().lines().flatten() {
                            if let Some(caps) = re_join.captures(&line_result) {
                                last_job_id = Some(caps[1].to_string());
                            } else if re_leave.is_match(&line_result) {
                                last_job_id = None;
                            }
                        }
                        last_pos = reader.get_ref().metadata().map(|m| m.len()).unwrap_or(0);
                    }
                }
            }

            if let Some(job_id) = &last_job_id {
                let _ = app.emit("new-job-id", job_id);
            }

            let mut should_rebuild = false;
            while !should_rebuild {
                if let Ok(next_path) = path_updates_rx.try_recv() {
                    log_dir = next_path;
                    should_rebuild = true;
                    continue;
                }

                match rx.recv_timeout(std::time::Duration::from_millis(500)) {
                    Ok(Ok(event)) => {
                        if let EventKind::Modify(_) = event.kind {
                            if let Some(path) = event.paths.get(0) {
                                if !path.to_string_lossy().contains("_Player") {
                                    continue;
                                }

                                if last_file.as_ref() != Some(path) {
                                    last_file = Some(path.clone());
                                    last_pos = 0;
                                }

                                if let Ok(file) = File::open(path) {
                                    let mut reader = BufReader::new(file);
                                    let _ = reader.seek(SeekFrom::Start(last_pos));

                                    for line_result in reader.by_ref().lines().flatten() {
                                        if let Some(caps) = re_join.captures(&line_result) {
                                            let job_id = caps[1].to_string();
                                            let _ = app.emit("new-job-id", &job_id);
                                        } else if re_leave.is_match(&line_result) {
                                            let _ = app.emit("new-job-id", &"global");
                                        }
                                    }

                                    last_pos = reader
                                        .get_ref()
                                        .metadata()
                                        .map(|m| m.len())
                                        .unwrap_or(last_pos);
                                }
                            }
                        }
                    }
                    Ok(Err(e)) => {
                        eprintln!("watch error: {:?}", e);
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }
        }
    });
}

fn start_key_listener(app: AppHandle) {
    std::thread::spawn(move || {
        let callback = move |event: Event| {
            if let EventType::KeyPress(key) = event.event_type {
                let key_name = format!("{key:?}");
                let _ = app.emit("key-pressed", key_name);
            }
        };

        if let Err(err) = listen(callback) {
            eprintln!("Error in global shortcut listener: {:?}", err);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    let initial_logs_path = default_roblox_logs_path();
    let (watcher_control_tx, watcher_control_rx) = mpsc::channel::<PathBuf>();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let _ = app.emit("single-instance", argv);
        }));
    }

    builder
        .manage(LogSettingsState {
            logs_path: Mutex::new(initial_logs_path.clone()),
            watcher_control: Mutex::new(Some(watcher_control_tx)),
        })
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_app_exit::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            start_log_watcher(
                app.handle().clone(),
                initial_logs_path.clone(),
                watcher_control_rx,
            );
            start_key_listener(app.handle().clone());
            #[cfg(desktop)]
            app.deep_link().register("bloxchat")?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            should_steal_focus,
            focus_roblox,
            is_image,
            get_default_roblox_logs_path,
            get_roblox_logs_path,
            set_roblox_logs_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
