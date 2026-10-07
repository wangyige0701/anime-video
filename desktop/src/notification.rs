#[cfg(windows)]
pub fn register_process_app_user_model_id(application_id: &str) -> bool {
    match set_app_user_model_id(application_id) {
        Ok(()) => true,
        Err(error) => {
            eprintln!("注册 Windows 应用标识失败: {error}");
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
        eprintln!("初始化 Windows Runtime 失败: {error}");
        return false;
    }

    let registration_error = set_app_user_model_id(application_id).err();
    let result = show_toast(Some(application_id)).or_else(|first_error| {
        if let Some(registration_error) = registration_error {
            eprintln!("应用标识已注册或注册失败: {registration_error}");
        }
        eprintln!("首次创建 Toast 通知失败: {first_error}");
        let _ = set_app_user_model_id(application_id);
        show_toast(None)
    });

    unsafe {
        RoUninitialize();
    }

    match result {
        Ok(()) => true,
        Err(error) => {
            eprintln!("发送启动 Toast 通知失败: {error}");
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
    document.LoadXml(&HSTRING::from(
        r#"<toast><visual><binding template="ToastGeneric"><text>动画管理服务</text><text>应用已成功启动</text></binding></visual></toast>"#,
    ))?;
    let toast = ToastNotification::CreateToastNotification(&document)?;
    let notifier = match application_id {
        Some(application_id) => {
            ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(application_id))?
        }
        None => ToastNotificationManager::CreateToastNotifier()?,
    };
    notifier.Show(&toast)
}

#[cfg(not(windows))]
pub fn show_startup(_: &str) -> bool {
    false
}
