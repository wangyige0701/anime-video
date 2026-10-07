use std::{
    env, fs,
    path::{Path, PathBuf},
};

use crate::logging;

pub fn load_app_user_model_id() -> Result<String, String> {
    let path = config_path();
    logging::info(format!("读取应用配置: {}", path.display()));
    let source = fs::read_to_string(&path)
        .map_err(|error| format!("无法读取配置文件 {}: {error}", path.display()))?;
    let value = yaml_value(&source, "application", "appUserModelId").ok_or_else(|| {
        format!(
            "配置文件 {} 缺少 application.appUserModelId",
            path.display()
        )
    })?;
    if value.is_empty() {
        return Err("application.appUserModelId 配置为空".to_string());
    }
    Ok(value)
}

pub fn config_path() -> PathBuf {
    if cfg!(debug_assertions) {
        return Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("desktop 必须位于工作区根目录下")
            .join("config.yaml");
    }

    application_root().join("server").join("config.yaml")
}

fn application_root() -> PathBuf {
    if let Ok(root) = env::var("ANIME_VIDEO_ROOT") {
        return PathBuf::from(root);
    }

    env::current_exe()
        .ok()
        .and_then(|executable| executable.parent().map(Path::to_path_buf))
        .or_else(|| env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."))
}

fn yaml_value(source: &str, section: &str, key: &str) -> Option<String> {
    let mut in_section = false;
    let mut section_indent = 0;
    let mut in_key = false;
    let mut key_indent = 0;

    for line in source.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let indent = line.len() - line.trim_start().len();
        if !in_section {
            if trimmed == format!("{section}:") {
                in_section = true;
                section_indent = indent;
            }
            continue;
        }

        if indent <= section_indent {
            in_section = trimmed == format!("{section}:");
            section_indent = indent;
            in_key = false;
            continue;
        }

        if trimmed == format!("{key}:") {
            in_key = true;
            key_indent = indent;
            continue;
        }

        let prefix = "value:";
        if in_key && indent > key_indent && trimmed.starts_with(prefix) {
            return parse_scalar(trimmed[prefix.len()..].trim());
        }

        if in_key && indent <= key_indent {
            in_key = false;
        }
    }

    None
}

fn parse_scalar(value: &str) -> Option<String> {
    let value = value
        .split_once(" #")
        .map_or(value, |(value, _)| value)
        .trim();
    if value.is_empty() {
        return Some(String::new());
    }

    let unquoted = value
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .or_else(|| {
            value
                .strip_prefix('\'')
                .and_then(|value| value.strip_suffix('\''))
        })
        .unwrap_or(value);
    Some(unquoted.to_string())
}
