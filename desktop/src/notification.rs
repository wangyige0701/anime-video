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
pub fn register_app_user_model_metadata(application_id: &str) -> bool {
    use windows::{
        Win32::System::Registry::{
            HKEY, HKEY_CURRENT_USER, KEY_WRITE, REG_OPTION_NON_VOLATILE, RegCloseKey,
            RegCreateKeyExW,
        },
        core::HSTRING,
    };

    let key_path = HSTRING::from(format!(
        "Software\\Classes\\AppUserModelId\\{application_id}"
    ));
    let mut key = HKEY::default();
    let status = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            &key_path,
            None,
            &HSTRING::new(),
            REG_OPTION_NON_VOLATILE,
            KEY_WRITE,
            None,
            &mut key,
            None,
        )
    };
    if status.0 != 0 {
        logging::error(format!("写入应用通知注册信息失败: {status:?}"));
        return false;
    }

    let display_name = set_registry_string(&key, "DisplayName", "动画管理服务");
    let icon_uri = startup_icon_uri()
        .map(|uri| set_registry_string(&key, "IconUri", &uri))
        .unwrap_or(true);
    unsafe {
        let _ = RegCloseKey(key);
    }
    let success = display_name && icon_uri;
    if success {
        logging::info("应用通知注册信息已写入");
    }
    success
}

#[cfg(windows)]
fn set_registry_string(
    key: &windows::Win32::System::Registry::HKEY,
    name: &str,
    value: &str,
) -> bool {
    use windows::Win32::System::Registry::{REG_SZ, RegSetValueExW};
    use windows::core::HSTRING;

    let data: Vec<u16> = value.encode_utf16().chain(std::iter::once(0)).collect();
    let bytes = unsafe {
        std::slice::from_raw_parts(data.as_ptr() as *const u8, data.len() * size_of::<u16>())
    };
    let status = unsafe { RegSetValueExW(*key, &HSTRING::from(name), None, REG_SZ, Some(bytes)) };
    if status.0 != 0 {
        logging::error(format!("写入应用通知字段失败 {name}: {status:?}"));
        return false;
    }
    true
}

#[cfg(not(windows))]
pub fn register_app_user_model_metadata(_: &str) -> bool {
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
pub fn show_already_running(application_id: &str) -> bool {
    let application_id = application_id.to_string();
    std::thread::spawn(move || show_message_on_thread(&application_id, "应用已经启动"))
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
    let result = show_toast(Some(application_id), false).or_else(|first_error| {
        if let Some(registration_error) = registration_error {
            logging::error(format!("应用标识注册失败: {registration_error:?}"));
        }
        logging::error(format!("首次创建 Toast 通知失败: {first_error:?}"));
        let _ = set_app_user_model_id(application_id);
        show_toast(None, false)
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
fn show_message_on_thread(application_id: &str, message: &str) -> bool {
    use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize};

    if let Err(error) = unsafe { RoInitialize(RO_INIT_MULTITHREADED) } {
        logging::error(format!("初始化 Windows Runtime 失败: {error:?}"));
        return false;
    }
    let result = set_app_user_model_id(application_id)
        .and_then(|_| show_toast_message(Some(application_id), message));
    unsafe {
        RoUninitialize();
    }
    match result {
        Ok(()) => {
            logging::info("已启动通知发送成功");
            true
        }
        Err(error) => {
            logging::error(format!("发送已启动通知失败: {error:?}"));
            false
        }
    }
}

#[cfg(windows)]
fn show_toast_message(application_id: Option<&str>, message: &str) -> windows::core::Result<()> {
    use windows::{
        Data::Xml::Dom::XmlDocument,
        UI::Notifications::{ToastNotification, ToastNotificationManager},
        core::HSTRING,
    };

    let document = XmlDocument::new()?;
    let xml = format!(
        r#"<toast duration="short"><visual><binding template="ToastGeneric"><text>动画管理服务</text><text>{message}</text></binding></visual></toast>"#
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
fn set_app_user_model_id(application_id: &str) -> windows::core::Result<()> {
    use windows::{Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID, core::HSTRING};

    unsafe { SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(application_id)) }
}

#[cfg(windows)]
fn show_toast(application_id: Option<&str>, include_icon: bool) -> windows::core::Result<()> {
    use windows::{
        Data::Xml::Dom::XmlDocument,
        UI::Notifications::{NotificationSetting, ToastNotification, ToastNotificationManager},
        core::HSTRING,
    };

    let document = XmlDocument::new()?;
    let image = if include_icon {
        startup_icon_uri()
            .map(|uri| {
                format!(r#"<image placement="appLogoOverride" src="{uri}" hint-crop="circle"/>"#)
            })
            .unwrap_or_default()
    } else {
        logging::info("使用无图标 Toast 备用内容");
        String::new()
    };
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

#[cfg(not(windows))]
pub fn show_already_running(_: &str) -> bool {
    false
}
