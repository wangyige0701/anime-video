use gpui::{App, Bounds, DisplayId, Pixels, Window, point, px, size};
use tray_icon::Rect;

const TRAY_GAP: i32 = -2;

pub struct TrayPlacement {
    pub bounds: Bounds<Pixels>,
    pub display_id: Option<DisplayId>,
}

#[cfg(windows)]
pub fn bring_to_front_and_align(window: &Window, tray_rect: Rect) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use std::ffi::c_void;
    use windows::Win32::{
        Foundation::{HWND, RECT},
        UI::WindowsAndMessaging::{GetWindowRect, HWND_TOPMOST, SWP_NOSIZE, SetWindowPos},
    };

    let Ok(handle) = HasWindowHandle::window_handle(window) else {
        return;
    };
    let RawWindowHandle::Win32(handle) = handle.as_raw() else {
        return;
    };
    let hwnd = HWND(handle.hwnd.get() as *mut c_void);
    let mut bounds = RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut bounds) }.is_err() {
        return;
    }

    let width = bounds.right - bounds.left;
    let height = bounds.bottom - bounds.top;
    let x = tray_rect.position.x as i32 - width - TRAY_GAP;
    let y = tray_rect.position.y as i32 - height - TRAY_GAP;
    let _ = unsafe { SetWindowPos(hwnd, Some(HWND_TOPMOST), x, y, 0, 0, SWP_NOSIZE) };
}

#[cfg(not(windows))]
pub fn bring_to_front_and_align(_: &Window, _: Rect) {}

#[cfg(windows)]
pub fn beside_tray_icon(
    tray_rect: Rect,
    panel_width: f32,
    panel_height: f32,
    cx: &App,
) -> TrayPlacement {
    use std::{ffi::c_void, mem};
    use windows::{
        Win32::{
            Foundation::{LPARAM, POINT, RECT},
            Graphics::Gdi::{
                EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITOR_DEFAULTTONEAREST,
                MONITORINFO, MonitorFromPoint,
            },
            UI::{
                HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI},
                WindowsAndMessaging::USER_DEFAULT_SCREEN_DPI,
            },
        },
        core::BOOL,
    };

    unsafe extern "system" fn collect_monitor(
        monitor: HMONITOR,
        _: HDC,
        _: *mut RECT,
        data: LPARAM,
    ) -> BOOL {
        let monitors = data.0 as *mut Vec<HMONITOR>;
        unsafe { (*monitors).push(monitor) };
        BOOL(1)
    }

    let tray_center = POINT {
        x: (tray_rect.position.x + f64::from(tray_rect.size.width) / 2.0) as i32,
        y: (tray_rect.position.y + f64::from(tray_rect.size.height) / 2.0) as i32,
    };
    let monitor = unsafe { MonitorFromPoint(tray_center, MONITOR_DEFAULTTONEAREST) };

    let mut monitor_info: MONITORINFO = unsafe { mem::zeroed() };
    monitor_info.cbSize = mem::size_of::<MONITORINFO>() as u32;
    let has_monitor_info = unsafe { GetMonitorInfoW(monitor, &mut monitor_info) }.as_bool();
    if !has_monitor_info {
        return centered(panel_width, panel_height, cx);
    }

    let mut dpi_x = USER_DEFAULT_SCREEN_DPI;
    let mut dpi_y = USER_DEFAULT_SCREEN_DPI;
    let _ = unsafe { GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y) };
    let scale = dpi_x as f32 / USER_DEFAULT_SCREEN_DPI as f32;
    let panel_width_physical = panel_width * scale;
    let panel_height_physical = panel_height * scale;
    let tray_left = tray_rect.position.x as f32;
    let tray_top = tray_rect.position.y as f32;
    let x = tray_left - panel_width_physical - TRAY_GAP as f32;
    let y = tray_top - panel_height_physical - TRAY_GAP as f32;

    let mut monitors = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(collect_monitor),
            LPARAM((&mut monitors as *mut Vec<HMONITOR>).cast::<c_void>() as isize),
        );
    }
    let display_id = monitors
        .iter()
        .position(|candidate| *candidate == monitor)
        .and_then(|index| cx.displays().get(index).map(|display| display.id()));

    TrayPlacement {
        bounds: Bounds::new(
            point(px(x / scale), px(y / scale)),
            size(px(panel_width), px(panel_height)),
        ),
        display_id,
    }
}

#[cfg(not(windows))]
pub fn beside_tray_icon(_: Rect, panel_width: f32, panel_height: f32, cx: &App) -> TrayPlacement {
    centered(panel_width, panel_height, cx)
}

fn centered(panel_width: f32, panel_height: f32, cx: &App) -> TrayPlacement {
    TrayPlacement {
        bounds: Bounds::centered(None, size(px(panel_width), px(panel_height)), cx),
        display_id: None,
    }
}
