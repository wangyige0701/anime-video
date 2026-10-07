use crate::logging;

#[cfg(windows)]
pub fn register_process_app_user_model_id(application_id: &str) -> bool {
    logging::info(format!("注册 Windows 应用标识: {application_id}"));
    match set_app_user_model_id(application_id) {
        Ok(()) => {
            logging::info("Windows 应用标识注册成功");
            true
        }
        Err(error) => {
            logging::error(format!("注册 Windows 应用标识失败: {error:?}"));
            false
        }
    }
}

#[cfg(not(windows))]
pub fn register_process_app_user_model_id(_: &str) -> bool {
    false
}

#[cfg(windows)]
pub fn show_startup(application_id: &str) -> bool {
    let application_id = application_id.to_string();
    std::thread::spawn(move || show_startup_on_thread(&application_id))
        .join()
        .unwrap_or(false)
}

#[cfg(windows)]
fn show_startup_on_thread(application_id: &str) -> bool {
    use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize};

    let initialized = unsafe { RoInitialize(RO_INIT_MULTITHREADED) };
    if let Err(error) = initialized {
        logging::error(format!("初始化 Windows Runtime 失败: {error:?}"));
        return false;
    }
    logging::info("Windows Runtime 初始化成功");

    let registration_error = set_app_user_model_id(application_id).err();
    let result = show_toast(Some(application_id)).or_else(|first_error| {
        if let Some(registration_error) = registration_error {
            logging::error(format!("应用标识注册失败: {registration_error:?}"));
        }
        logging::error(format!("首次创建 Toast 通知失败: {first_error:?}"));
        let _ = set_app_user_model_id(application_id);
        show_toast(None)
    });

    unsafe {
        RoUninitialize();
    }

    match result {
        Ok(()) => true,
        Err(error) => {
            logging::error(format!("发送启动 Toast 通知失败: {error:?}"));
            false
        }
    }
}

#[cfg(windows)]
fn set_app_user_model_id(application_id: &str) -> windows::core::Result<()> {
    use windows::{Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID, core::HSTRING};

    unsafe { SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(application_id)) }
}

#[cfg(windows)]
fn show_toast(application_id: Option<&str>) -> windows::core::Result<()> {
    use windows::{
        Data::Xml::Dom::XmlDocument,
        UI::Notifications::{ToastNotification, ToastNotificationManager},
        core::HSTRING,
    };

    let document = XmlDocument::new()?;
    let image = startup_icon_uri()
        .map(|uri| {
            format!(r#"<image placement="appLogoOverride" src="{uri}" hint-crop="circle"/>"#)
        })
        .unwrap_or_default();
    let xml = format!(
        r#"<toast><visual><binding template="ToastGeneric"><text>动画管理服务</text><text>应用已成功启动</text>{image}</binding></visual></toast>"#
    );
    logging::info(format!("Toast 内容: {xml}"));
    document.LoadXml(&HSTRING::from(xml))?;
    let toast = ToastNotification::CreateToastNotification(&document)?;
    let notifier = match application_id {
        Some(application_id) => {
            ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(application_id))?
        }
        None => ToastNotificationManager::CreateToastNotifier()?,
    };
    notifier.Show(&toast)
}

#[cfg(windows)]
fn startup_icon_uri() -> Option<String> {
    let icon = if cfg!(debug_assertions) {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/icon.png")
    } else {
        std::env::current_exe().ok()?.parent()?.join("icon.png")
    };
    if !icon.is_file() {
        logging::error(format!("Toast 图标文件不存在: {}", icon.display()));
        return None;
    }
    let value = icon.to_string_lossy().replace('\\', "/");
    Some(format!("file:///{}", percent_encode_uri_path(&value)))
}

#[cfg(windows)]
fn percent_encode_uri_path(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'/' | b':' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

#[cfg(not(windows))]
pub fn show_startup(_: &str) -> bool {
    false
}
