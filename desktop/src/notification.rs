#[cfg(windows)]
use tray_icon::TrayIcon;

#[cfg(windows)]
pub fn show_startup(icon: &TrayIcon) {
    use windows::{
        Win32::{
            Foundation::{HINSTANCE, HWND},
            System::LibraryLoader::GetModuleHandleW,
            UI::{
                Shell::{NIF_INFO, NIIF_USER, NIM_MODIFY, NOTIFYICONDATAW, Shell_NotifyIconW},
                WindowsAndMessaging::LoadIconW,
            },
        },
        core::PCWSTR,
    };

    let Ok(module) = (unsafe { GetModuleHandleW(PCWSTR::null()) }) else {
        return;
    };
    let resource_id = PCWSTR(1 as *const u16);
    let app_icon = unsafe { LoadIconW(Some(HINSTANCE(module.0)), resource_id) }.ok();
    let mut notification = NOTIFYICONDATAW {
        cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
        hWnd: HWND(icon.window_handle() as _),
        // tray-icon allocates the first icon in a process with internal id 1.
        uID: 1,
        uFlags: NIF_INFO,
        dwInfoFlags: NIIF_USER,
        hBalloonIcon: app_icon.unwrap_or_default(),
        ..Default::default()
    };
    copy_text("动画管理服务", &mut notification.szInfoTitle);
    copy_text("应用已成功启动", &mut notification.szInfo);

    unsafe {
        let _ = Shell_NotifyIconW(NIM_MODIFY, &notification);
    }
}

#[cfg(windows)]
fn copy_text<const N: usize>(text: &str, target: &mut [u16; N]) {
    let encoded: Vec<u16> = text.encode_utf16().collect();
    let length = encoded.len().min(N.saturating_sub(1));
    target[..length].copy_from_slice(&encoded[..length]);
    target[length] = 0;
}

#[cfg(not(windows))]
pub fn show_startup(_: &tray_icon::TrayIcon) {}
