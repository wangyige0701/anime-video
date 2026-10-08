use std::{
    env,
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

static LOG_FILE: OnceLock<Mutex<File>> = OnceLock::new();

pub fn init() -> Option<PathBuf> {
    let path = log_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(file) => {
            let _ = LOG_FILE.set(Mutex::new(file));
            info(format!("日志已初始化，文件: {}", path.display()));
            Some(path)
        }
        Err(error) => {
            eprintln!("无法创建桌面端日志文件 {}: {error}", path.display());
            None
        }
    }
}

pub fn info(message: impl AsRef<str>) {
    write("信息", message.as_ref());
}

pub fn error(message: impl AsRef<str>) {
    write("错误", message.as_ref());
}

pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        error(format!("未捕获异常: {panic_info}"));
        previous(panic_info);
    }));
}

fn write(level: &str, message: &str) {
    let Some(file) = LOG_FILE.get() else {
        return;
    };
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    if let Ok(mut file) = file.lock() {
        let _ = writeln!(file, "[{timestamp}] [{level}] {message}");
        let _ = file.flush();
    }
}

fn log_path() -> PathBuf {
    if let Ok(directory) = env::var("ANIME_VIDEO_DESKTOP_LOG_DIR") {
        return PathBuf::from(directory).join("desktop.log");
    }

    if cfg!(debug_assertions) {
        return Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("desktop 必须位于工作区根目录中")
            .join("logs")
            .join("desktop.log");
    }

    env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
        .join("logs")
        .join("desktop.log")
}
