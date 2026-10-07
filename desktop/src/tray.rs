use crate::cli;
use crate::notification;
use crate::panel::{PANEL_WIDTH, TrayPanel, panel_height_for_directory_count};
use crate::position;
use crate::state::CachedState;
use gpui::{
    App, AppContext, AsyncApp, Bounds, Context, Global, Render, Subscription, TitlebarOptions,
    Window, WindowHandle, WindowKind, WindowOptions, div, point, prelude::*, px, size,
};
use tray_icon::{
    Icon, MouseButton, MouseButtonState, Rect, TrayIcon, TrayIconBuilder, TrayIconEvent,
};

pub struct TrayState {
    _icon: TrayIcon,
    _host: WindowHandle<TrayHost>,
    _quit_subscription: Subscription,
    cache: CachedState,
    panel: Option<WindowHandle<TrayPanel>>,
}

impl Global for TrayState {}

struct TrayHost;

impl Render for TrayHost {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
    }
}

pub fn install(cx: &mut App) {
    let cache = CachedState::new();
    let icon = TrayIconBuilder::new()
        .with_tooltip("动画管理服务")
        .with_icon(application_icon())
        .with_menu_on_left_click(false)
        .with_menu_on_right_click(false)
        .build()
        .expect("创建托盘图标失败");
    notification::show_startup(&icon);

    let host = cx
        .open_window(
            WindowOptions {
                window_bounds: Some(gpui::WindowBounds::Windowed(Bounds::new(
                    point(px(-10_000.0), px(-10_000.0)),
                    size(px(1.0), px(1.0)),
                ))),
                titlebar: None,
                focus: false,
                show: false,
                kind: WindowKind::PopUp,
                is_movable: false,
                is_resizable: false,
                is_minimizable: false,
                ..Default::default()
            },
            |_, cx| cx.new(|_| TrayHost),
        )
        .expect("创建托盘宿主窗口失败");

    let quit_subscription = cx.on_app_quit(|_| {
        if let Err(error) = cli::stop_all_services() {
            eprintln!("退出时停止服务失败: {error}");
        }
        async {}
    });

    cx.set_global(TrayState {
        _icon: icon,
        _host: host,
        _quit_subscription: quit_subscription,
        cache: cache.clone(),
        panel: None,
    });

    preload_state(cache, cx);

    let (sender, receiver) = async_channel::unbounded();
    TrayIconEvent::set_event_handler(Some(move |event| {
        if let TrayIconEvent::Click {
            rect,
            button: MouseButton::Left | MouseButton::Right,
            button_state: MouseButtonState::Up,
            ..
        } = event
        {
            let _ = sender.try_send(rect);
        }
    }));

    cx.spawn(async move |cx: &mut AsyncApp| {
        while let Ok(rect) = receiver.recv().await {
            let _ = cx.update(move |cx| toggle_panel(rect, cx));
        }
    })
    .detach();
}

fn preload_state(cache: CachedState, cx: &mut App) {
    let snapshot_cache = cache.clone();
    cx.spawn(async move |cx: &mut AsyncApp| {
        let result = cx
            .background_executor()
            .spawn(async { cli::load_snapshot() })
            .await;
        match result {
            Ok(snapshot) => snapshot_cache.update_snapshot(snapshot),
            Err(error) => eprintln!("预取服务状态失败: {error}"),
        }
    })
    .detach();

    cx.spawn(async move |cx: &mut AsyncApp| {
        let result = cx
            .background_executor()
            .spawn(async { cli::load_web_url() })
            .await;
        match result {
            Ok(web_url) => {
                cache.update_web_url(web_url);
                let _ = cx.update(|cx| {
                    let panel = cx.global::<TrayState>().panel;
                    if let Some(panel) = panel {
                        let _ = panel.update(cx, |_, _, cx| cx.notify());
                    }
                });
            }
            Err(error) => eprintln!("预取网页地址失败: {error}"),
        }
    })
    .detach();
}

fn toggle_panel(rect: Rect, cx: &mut App) {
    if let Some(panel) = cx.global::<TrayState>().panel {
        if panel
            .update(cx, |_, window, _| window.remove_window())
            .is_ok()
        {
            cx.global_mut::<TrayState>().panel = None;
            return;
        }
    }

    let cache = cx.global::<TrayState>().cache.clone();
    let panel_height = panel_height_for_directory_count(cache.read().snapshot.directories.len());
    let placement = position::beside_tray_icon(rect, PANEL_WIDTH, panel_height, cx);
    let options = WindowOptions {
        window_bounds: Some(gpui::WindowBounds::Windowed(placement.bounds)),
        titlebar: Some(TitlebarOptions {
            title: Some("动画管理服务".into()),
            appears_transparent: true,
            ..Default::default()
        }),
        kind: WindowKind::PopUp,
        is_movable: false,
        is_resizable: false,
        is_minimizable: false,
        display_id: placement.display_id,
        ..Default::default()
    };

    match cx.open_window(options, |window, cx| {
        cx.new(|cx| TrayPanel::new(cache, rect, panel_height, window, cx))
    }) {
        Ok(panel) => {
            let _ = panel.update(cx, |_, window, _| {
                position::bring_to_front_and_align(window, rect);
                window.activate_window();
            });
            cx.global_mut::<TrayState>().panel = Some(panel);
        }
        Err(error) => eprintln!("无法打开服务管理面板: {error:?}"),
    }
}

fn application_icon() -> Icon {
    let image = image::load_from_memory(include_bytes!("../assets/icon_64.png"))
        .expect("读取托盘图标失败")
        .into_rgba8();
    let (width, height) = image.dimensions();
    Icon::from_rgba(image.into_raw(), width, height).expect("转换托盘图标失败")
}
