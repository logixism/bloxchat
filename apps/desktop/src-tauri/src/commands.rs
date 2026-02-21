use crate::media::MediaProbe;
use crate::roblox::LogSettingsState;
use tauri::AppHandle;

fn to_cmd<T>(result: anyhow::Result<T>) -> Result<T, String> {
    result.map_err(|err| format!("{:#}", err))
}

#[tauri::command]
pub(crate) fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub(crate) fn get_default_roblox_logs_path() -> String {
    crate::roblox::default_roblox_logs_path()
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
pub(crate) fn get_roblox_logs_path(
    state: tauri::State<LogSettingsState>,
) -> Result<String, String> {
    to_cmd(
        crate::roblox::get_roblox_logs_path(&*state).map(|path| path.to_string_lossy().to_string()),
    )
}

#[tauri::command]
pub(crate) fn set_roblox_logs_path(
    path: String,
    state: tauri::State<LogSettingsState>,
) -> Result<String, String> {
    to_cmd(
        crate::roblox::set_roblox_logs_path(&*state, &path)
            .map(|path| path.to_string_lossy().to_string()),
    )
}

#[tauri::command]
pub(crate) fn get_job_id(state: tauri::State<LogSettingsState>) -> Result<String, String> {
    to_cmd(crate::roblox::get_job_id(&*state))
}

#[tauri::command]
pub(crate) fn should_steal_focus(app: AppHandle) -> bool {
    crate::roblox::should_steal_focus(app)
}

#[tauri::command]
pub(crate) fn focus_roblox() -> bool {
    crate::roblox::focus_roblox()
}

#[tauri::command]
pub(crate) async fn is_image(url: String) -> Result<MediaProbe, String> {
    to_cmd(crate::media::is_image(&url).await)
}
