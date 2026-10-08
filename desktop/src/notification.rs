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
    show_message(application_id, "应用已成功启动")
}

#[cfg(windows)]
pub fn show_already_running(application_id: &str) -> bool {
    show_message(application_id, "应用已经启动")
}

#[cfg(windows)]
fn show_message(application_id: &str, message: &str) -> bool {
    let application_id = application_id.to_string();
    let message = message.to_string();
    std::thread::spawn(move || show_message_on_thread(&application_id, &message))
        .join()
        .unwrap_or(false)
}

#[cfg(windows)]
fn show_message_on_thread(application_id: &str, message: &str) -> bool {
    use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize};

    if let Err(error) = unsafe { RoInitialize(RO_INIT_MULTITHREADED) } {
        logging::error(format!("初始化 Windows Runtime 失败: {error:?}"));
        return false;
    }
    logging::info("Windows Runtime 初始化成功");

    let result = show_toast(application_id, message);

    unsafe {
        RoUninitialize();
    }

    match result {
        Ok(()) => {
            logging::info("Toast 通知发送成功");
            true
        }
        Err(error) => {
            logging::error(format!("Toast 通知发送失败: {error:?}"));
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
fn show_toast(application_id: &str, message: &str) -> windows::core::Result<()> {
    use windows::{
        Data::Xml::Dom::XmlDocument,
        UI::Notifications::{NotificationSetting, ToastNotification, ToastNotificationManager},
        core::HSTRING,
    };

    let uri = match startup_icon_uri() {
        Some(uri) => uri,
        None => {
            return Err(windows::core::Error::new(
                windows::core::HRESULT(0x80070002u32 as i32),
                "Toast 图标文件不存在",
            ));
        }
    };
    let image = format!(r#"<image placement="appLogoOverride" src="{uri}" hint-crop="circle"/>"#);
    let xml = format!(
        r#"<toast duration="short"><visual><binding template="ToastGeneric"><text>动画管理服务</text><text>{message}</text>{image}</binding></visual></toast>"#
    );
    logging::info(format!("Toast 内容: {xml}"));

    let document = XmlDocument::new()?;
    document.LoadXml(&HSTRING::from(xml))?;
    let toast = ToastNotification::CreateToastNotification(&document)?;
    let notifier =
        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(application_id))?;
    match notifier.Setting() {
        Ok(setting) if setting == NotificationSetting::Enabled => {
            logging::info("Windows 应用通知状态：已启用");
        }
        Ok(setting) => {
            logging::error(format!("Windows 应用通知状态未启用: {setting:?}"));
        }
        Err(error) => {
            logging::error(format!("读取 Windows 应用通知状态失败: {error:?}"));
        }
    }
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
    let uri = format!("file:///{}", percent_encode_uri_path(&value));
    logging::info(format!("Toast 图标路径: {uri}"));
    Some(uri)
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

#[cfg(not(windows))]
pub fn show_already_running(_: &str) -> bool {
    false
}
