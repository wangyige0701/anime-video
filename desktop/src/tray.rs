use crate::panel::TrayPanel;
use gpui::{
    App, AppContext, AsyncApp, Bounds, Global, Timer, TitlebarOptions, WindowHandle, WindowKind,
    WindowOptions, px, size,
};
use std::time::Duration;
use tray_icon::{Icon, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};

const PANEL_WIDTH: f32 = 500.0;
const PANEL_HEIGHT: f32 = 720.0;

pub struct TrayState {
    _icon: TrayIcon,
    panel: Option<WindowHandle<TrayPanel>>,
}

impl Global for TrayState {}

pub fn install(cx: &mut App) {
    let icon = TrayIconBuilder::new()
        .with_tooltip("Anime Video 服务管理")
        .with_icon(application_icon())
        .with_menu_on_left_click(false)
        .with_menu_on_right_click(false)
        .build()
        .expect("创建托盘图标失败");

    cx.set_global(TrayState {
        _icon: icon,
        panel: None,
    });

    cx.spawn(async move |cx: &mut AsyncApp| {
        loop {
            Timer::after(Duration::from_millis(80)).await;

            while let Ok(event) = TrayIconEvent::receiver().try_recv() {
                if matches!(
                    event,
                    TrayIconEvent::Click {
                        button_state: MouseButtonState::Up,
                        ..
                    }
                ) {
                    let _ = cx.update(open_panel);
                }
            }
        }
    })
    .detach();
}

fn open_panel(cx: &mut App) {
    if let Some(panel) = cx.global::<TrayState>().panel {
        if panel
            .update(cx, |_, window, _| window.activate_window())
            .is_ok()
        {
            return;
        }
    }

    let bounds = Bounds::centered(None, size(px(PANEL_WIDTH), px(PANEL_HEIGHT)), cx);
    let options = WindowOptions {
        window_bounds: Some(gpui::WindowBounds::Windowed(bounds)),
        titlebar: Some(TitlebarOptions {
            title: Some("Anime Video 服务管理".into()),
            appears_transparent: true,
            ..Default::default()
        }),
        kind: WindowKind::PopUp,
        is_movable: false,
        is_resizable: false,
        is_minimizable: false,
        ..Default::default()
    };

    match cx.open_window(options, |_, cx| cx.new(TrayPanel::new)) {
        Ok(panel) => cx.global_mut::<TrayState>().panel = Some(panel),
        Err(error) => eprintln!("无法打开服务管理面板: {error:?}"),
    }
}

fn application_icon() -> Icon {
    let image = image::load_from_memory(include_bytes!("../assets/icon.png"))
        .expect("读取托盘图标失败")
        .into_rgba8();
    let (width, height) = image.dimensions();
    Icon::from_rgba(image.into_raw(), width, height).expect("转换托盘图标失败")
}
