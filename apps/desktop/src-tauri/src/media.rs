use anyhow::Result;
use regex::Regex;
use reqwest::header::{CONTENT_TYPE, RANGE};
use std::sync::LazyLock;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MediaProbe {
    displayable: bool,
    kind: String,
    final_url: String,
}

pub(crate) async fn is_image(url: &str) -> Result<MediaProbe> {
    let client = reqwest::Client::new();
    let initial_probe = probe_media_url(&client, url).await;
    if initial_probe.displayable {
        return Ok(initial_probe);
    }

    if let Some(resolved_media_url) =
        resolve_media_url_from_html(&client, &initial_probe.final_url).await
    {
        let resolved_probe = probe_media_url(&client, &resolved_media_url).await;
        if resolved_probe.displayable {
            return Ok(resolved_probe);
        }
    }

    Ok(initial_probe)
}

fn classify_media_from_content_type(content_type: &str) -> Option<&'static str> {
    let normalized = content_type.split(';').next().unwrap_or("").trim();
    if normalized.starts_with("image/") {
        return Some("image");
    }

    if normalized.starts_with("video/") {
        return Some("video");
    }

    None
}

fn classify_media_from_url_path(url: &str) -> Option<&'static str> {
    let path = reqwest::Url::parse(url).ok()?.path().to_string();
    let file_name = path.rsplit('/').next().unwrap_or("").to_ascii_lowercase();
    let ext = file_name.rsplit('.').next().unwrap_or("");
    if ext == file_name {
        return None;
    }

    match ext {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "avif" | "apng" => Some("image"),
        "mp4" | "webm" | "mov" | "gifv" => Some("video"),
        _ => None,
    }
}

async fn probe_media_url(client: &reqwest::Client, url: &str) -> MediaProbe {
    let mut final_url = url.to_string();
    let mut content_type: Option<String> = None;

    if let Ok(head_resp) = client.head(url).send().await {
        final_url = head_resp.url().to_string();
        if let Some(value) = head_resp.headers().get(CONTENT_TYPE) {
            if let Ok(value_str) = value.to_str() {
                content_type = Some(value_str.to_ascii_lowercase());
            }
        }
    }

    if content_type.is_none() {
        if let Ok(get_resp) = client.get(url).header(RANGE, "bytes=0-4096").send().await {
            final_url = get_resp.url().to_string();
            if let Some(value) = get_resp.headers().get(CONTENT_TYPE) {
                if let Ok(value_str) = value.to_str() {
                    content_type = Some(value_str.to_ascii_lowercase());
                }
            }
        }
    }

    if let Some(kind) = content_type
        .as_deref()
        .and_then(classify_media_from_content_type)
    {
        return MediaProbe {
            displayable: true,
            kind: kind.to_string(),
            final_url,
        };
    }

    if let Some(kind) =
        classify_media_from_url_path(&final_url).or_else(|| classify_media_from_url_path(url))
    {
        return MediaProbe {
            displayable: true,
            kind: kind.to_string(),
            final_url,
        };
    }

    MediaProbe {
        displayable: false,
        kind: "none".to_string(),
        final_url,
    }
}

async fn resolve_media_url_from_html(client: &reqwest::Client, url: &str) -> Option<String> {
    let response = client.get(url).send().await.ok()?;
    let response_url = response.url().clone();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    if !content_type.contains("text/html") {
        return None;
    }

    let body = response.text().await.ok()?;
    extract_media_url_from_meta_tags(&body, &response_url)
}

static META_TAG_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<meta\s+[^>]*>").expect("valid meta tag regex"));
static META_CONTENT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)\bcontent\s*=\s*["']([^"']+)["']"#).expect("valid content regex")
});

fn extract_media_url_from_meta_tags(html: &str, base_url: &reqwest::Url) -> Option<String> {
    let media_keys = [
        "og:video",
        "og:video:url",
        "og:image",
        "og:image:url",
        "twitter:image",
        "twitter:image:src",
        "twitter:player:stream",
    ];

    for meta_tag_match in META_TAG_RE.find_iter(html) {
        let tag = meta_tag_match.as_str();
        let lower_tag = tag.to_ascii_lowercase();
        if !media_keys.iter().any(|key| lower_tag.contains(key)) {
            continue;
        }

        let Some(content) = META_CONTENT_RE
            .captures(tag)
            .and_then(|caps| caps.get(1))
            .map(|capture| capture.as_str().trim())
            .filter(|value| !value.is_empty() && !value.starts_with("data:"))
        else {
            continue;
        };

        if let Ok(parsed) = reqwest::Url::parse(content) {
            return Some(parsed.to_string());
        }

        if let Ok(joined) = base_url.join(content) {
            return Some(joined.to_string());
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_type_classification() {
        assert_eq!(
            classify_media_from_content_type("image/png; charset=utf-8"),
            Some("image")
        );
        assert_eq!(classify_media_from_content_type("video/mp4"), Some("video"));
        assert_eq!(classify_media_from_content_type("text/html"), None);
    }

    #[test]
    fn url_path_classification() {
        assert_eq!(
            classify_media_from_url_path("https://example.com/a.png"),
            Some("image")
        );
        assert_eq!(
            classify_media_from_url_path("https://example.com/v.mp4?x=1"),
            Some("video")
        );
        assert_eq!(
            classify_media_from_url_path("https://example.com/noext"),
            None
        );
    }

    #[test]
    fn extract_media_from_meta_tags() {
        let base = reqwest::Url::parse("https://example.com/page").unwrap();
        let html = r#"
            <html>
              <head>
                <meta property="og:image" content="/img.png" />
              </head>
            </html>
        "#;
        assert_eq!(
            extract_media_url_from_meta_tags(html, &base),
            Some("https://example.com/img.png".to_string())
        );
    }
}
