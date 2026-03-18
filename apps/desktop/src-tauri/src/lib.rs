mod commands;
mod media;
mod roblox;
mod updater;

use commands::*;
#[cfg(target_os = "windows")]
use rdev::{listen, Event, EventType};
use std::path::PathBuf;
use std::sync::{mpsc, Mutex};
use tauri::Emitter;
#[cfg(target_os = "linux")]
use tauri::Manager;
use tauri::{AppHandle, WebviewWindow};
#[cfg(desktop)]
use tauri_plugin_deep_link::DeepLinkExt;
#[cfg(target_os = "linux")]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    let initial_logs_path = roblox::default_roblox_logs_path();
    let (watcher_control_tx, watcher_control_rx) = mpsc::channel::<PathBuf>();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            show_chat_window(app);
            let _ = app.emit("single-instance", argv);
        }));
    }

    builder
        .manage(roblox::LogSettingsState {
            logs_path: Mutex::new(initial_logs_path.clone()),
            watcher_control: Mutex::new(Some(watcher_control_tx)),
        })
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_app_exit::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drpc::init())
        .setup(move |app| {
            prime_chat_window(app.handle());
            tauri::async_runtime::spawn(updater::check_for_startup_update(app.handle().clone()));
            roblox::start_log_watcher(initial_logs_path.clone(), watcher_control_rx);
            start_key_listener(app.handle().clone());
            #[cfg(target_os = "linux")]
            if let Err(err) = register_linux_shortcuts(app.handle().clone()) {
                eprintln!("Failed to register Linux global shortcuts: {err:#}");
            }
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
            set_roblox_logs_path,
            get_job_id
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(target_os = "windows")]
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

#[cfg(not(target_os = "windows"))]
fn start_key_listener(_app: AppHandle) {}

const CHAT_WINDOW_LABEL: &str = "main";

fn apply_chat_window_display_prefs(window: &WebviewWindow) {
    let _ = window.set_always_on_top(true);

    #[cfg(target_os = "linux")]
    let _ = window.set_visible_on_all_workspaces(true);
}

fn prime_chat_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(CHAT_WINDOW_LABEL) else {
        return;
    };

    #[cfg(not(target_os = "linux"))]
    let _ = window.set_focusable(true);
    apply_chat_window_display_prefs(&window);
}

fn show_chat_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(CHAT_WINDOW_LABEL) else {
        return;
    };

    apply_chat_window_display_prefs(&window);
    let _ = window.unminimize();
    let _ = window.show();

    #[cfg(not(target_os = "linux"))]
    let _ = window.set_focusable(true);
    #[cfg(not(target_os = "linux"))]
    let _ = window.set_focus();
    #[cfg(not(target_os = "linux"))]
    let _ = app.emit("focus-chat-input", ());
}

#[cfg(target_os = "linux")]
fn register_linux_shortcuts(app: AppHandle) -> tauri::Result<()> {
    let shortcuts = [
        Shortcut::new(None, Code::Slash),
        Shortcut::new(None, Code::NumpadDivide),
    ];

    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }

                if !shortcuts.iter().any(|registered| registered == shortcut) {
                    return;
                }

                show_chat_window(app);
            })
            .build(),
    )?;

    app.global_shortcut()
        .register_multiple(shortcuts)
        .map_err(anyhow::Error::from)?;

    Ok(())
}
