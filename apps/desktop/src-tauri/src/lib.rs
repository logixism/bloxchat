mod commands;
mod media;
mod roblox;
mod updater;

use commands::*;
use rdev::{listen, Event, EventType};
use std::path::PathBuf;
use std::sync::{mpsc, Mutex};
use tauri::AppHandle;
use tauri::Emitter;
#[cfg(desktop)]
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    let initial_logs_path = roblox::default_roblox_logs_path();
    let (watcher_control_tx, watcher_control_rx) = mpsc::channel::<PathBuf>();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
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
        .setup(move |app| {
            tauri::async_runtime::spawn(updater::check_for_startup_update(app.handle().clone()));
            roblox::start_log_watcher(initial_logs_path.clone(), watcher_control_rx);
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
            set_roblox_logs_path,
            get_job_id
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
