use std::fs;
use std::path::Path;

fn main() {
    assert_tauri_version_matches_cargo();
    tauri_build::build()
}

fn assert_tauri_version_matches_cargo() {
    let cargo_version = env!("CARGO_PKG_VERSION");
    let tauri_conf_path = Path::new("tauri.conf.json");

    let contents = fs::read_to_string(tauri_conf_path).unwrap_or_else(|err| {
        panic!("failed to read {}: {err}", tauri_conf_path.display());
    });

    let config: serde_json::Value = serde_json::from_str(&contents).unwrap_or_else(|err| {
        panic!("failed to parse {} as JSON: {err}", tauri_conf_path.display());
    });

    let Some(tauri_version) = config.get("version").and_then(|v| v.as_str()) else {
        return;
    };

    if tauri_version != cargo_version {
        panic!(
            "version mismatch: Cargo.toml package.version is {cargo_version} but tauri.conf.json version is {tauri_version}. run `bun run desktop:version -- {tauri_version}`"
        );
    }
}
