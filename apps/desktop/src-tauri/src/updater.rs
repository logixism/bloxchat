use anyhow::{Context, Result};
use serde::Deserialize;
use std::cmp::Ordering;
use std::path::Path;
use std::process::Command;
use tauri::AppHandle;

const GITHUB_REPO: &str = "logixism/bloxchat";
const MSI_ASSET_NAME: &str = "BloxChat.msi";

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    assets: Vec<GithubReleaseAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubReleaseAsset {
    name: String,
    browser_download_url: String,
}

fn normalize_version(version: &str) -> String {
    version.trim().trim_start_matches('v').to_string()
}

fn parse_semver_parts(version: &str) -> Option<Vec<u64>> {
    let normalized = normalize_version(version);
    let core = normalized.split(['-', '+']).next().unwrap_or("").trim();
    if core.is_empty() {
        return None;
    }

    let mut parts = Vec::new();
    for segment in core.split('.') {
        parts.push(segment.parse::<u64>().ok()?);
    }

    Some(parts)
}

fn compare_versions(left: &str, right: &str) -> Option<Ordering> {
    let mut left_parts = parse_semver_parts(left)?;
    let mut right_parts = parse_semver_parts(right)?;
    let max = left_parts.len().max(right_parts.len());
    left_parts.resize(max, 0);
    right_parts.resize(max, 0);
    Some(left_parts.cmp(&right_parts))
}

fn is_newer_version(candidate: &str, current: &str) -> bool {
    matches!(
        compare_versions(candidate, current),
        Some(Ordering::Greater)
    )
}

async fn fetch_latest_release(client: &reqwest::Client) -> Result<GithubRelease> {
    let endpoint = format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest");
    let response = client
        .get(endpoint)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .context("send GitHub release request")?;

    if !response.status().is_success() {
        anyhow::bail!(
            "GitHub latest release request failed: {}",
            response.status()
        );
    }

    let payload = response.text().await.context("read GitHub response")?;
    serde_json::from_str::<GithubRelease>(&payload).context("parse GitHub response")
}

fn release_msi_url(release: &GithubRelease) -> Option<String> {
    release
        .assets
        .iter()
        .find(|asset| asset.name.eq_ignore_ascii_case(MSI_ASSET_NAME))
        .map(|asset| asset.browser_download_url.clone())
}

async fn download_installer(
    client: &reqwest::Client,
    download_url: &str,
    target_path: &Path,
) -> Result<()> {
    let response = client
        .get(download_url)
        .header("Accept", "application/octet-stream")
        .send()
        .await
        .context("send installer download request")?;

    if !response.status().is_success() {
        anyhow::bail!(
            "Installer download failed with status {}",
            response.status()
        );
    }

    let bytes = response.bytes().await.context("read installer bytes")?;
    std::fs::write(target_path, &bytes).context("write installer file")
}

fn run_installer_and_exit(app: &AppHandle, installer_path: &Path) -> Result<()> {
    let installer = installer_path
        .to_str()
        .context("installer path is not valid UTF-8")?;

    Command::new("msiexec")
        .args(["/i", installer, "/passive", "/norestart"])
        .spawn()
        .context("spawn msiexec")?;

    app.exit(0);
    Ok(())
}

pub(crate) async fn check_for_startup_update(app: AppHandle) {
    // Never auto-update in development/debug runs (e.g. `cargo tauri dev`).
    if cfg!(debug_assertions) {
        return;
    }

    if !cfg!(target_os = "windows") {
        return;
    }

    if let Err(err) = try_startup_update(&app).await {
        eprintln!("updater failed: {err:#}");
    }
}

async fn try_startup_update(app: &AppHandle) -> Result<()> {
    let current_version = app.package_info().version.to_string();

    let client = reqwest::Client::builder()
        .user_agent("BloxChat-Updater/1.0")
        .build()
        .context("build HTTP client")?;

    let latest_release = fetch_latest_release(&client).await?;
    let latest_version = normalize_version(&latest_release.tag_name);
    let current_normalized = normalize_version(&current_version);

    if !is_newer_version(&latest_version, &current_normalized) {
        return Ok(());
    }

    let Some(msi_url) = release_msi_url(&latest_release) else {
        eprintln!("updater skipped: release missing {MSI_ASSET_NAME}");
        return Ok(());
    };

    let installer_path = std::env::temp_dir().join(format!("BloxChat-{latest_version}.msi"));
    download_installer(&client, &msi_url, &installer_path).await?;
    run_installer_and_exit(app, &installer_path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_version_strips_prefix() {
        assert_eq!(normalize_version("v1.2.3"), "1.2.3");
        assert_eq!(normalize_version("  v0.0.1 "), "0.0.1");
    }

    #[test]
    fn compare_versions_pads_missing_parts() {
        assert_eq!(compare_versions("1.2", "1.2.0"), Some(Ordering::Equal));
        assert_eq!(compare_versions("1.2.10", "1.2.9"), Some(Ordering::Greater));
        assert_eq!(compare_versions("1.0.0", "2.0.0"), Some(Ordering::Less));
    }
}
