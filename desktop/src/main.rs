use gpui::{
    App, Application, AsyncApp, Global, Timer, Window, WindowHandle, WindowOptions, div, prelude::*,
};
use std::time::Duration;
use tray_icon::{
    Icon, TrayIcon, TrayIconBuilder,
    menu::{Menu, MenuEvent, MenuItem},
};

struct AnimeVideo;

impl Render for AnimeVideo {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        div().child("Anime Video")
    }
}

struct DesktopState {
    _tray: TrayIcon,
    main_window: Option<WindowHandle<AnimeVideo>>,
}

impl Global for DesktopState {}

fn main() {
    Application::new().run(|cx| {
        let menu = Menu::new();
        let open = MenuItem::with_id("open", "打开视频管理器", true, None);
        let quit = MenuItem::with_id("quit", "退出", true, None);
        menu.append_items(&[&open, &quit])
            .expect("创建托盘菜单失败");

        let tray = TrayIconBuilder::new()
            .with_tooltip("视频管理器")
            .with_icon(application_icon())
            .with_menu(Box::new(menu))
            .build()
            .expect("创建托盘图标失败");

        cx.set_global(DesktopState {
            _tray: tray,
            main_window: None,
        });

        cx.spawn(async move |cx: &mut AsyncApp| {
            loop {
                Timer::after(Duration::from_millis(100)).await;

                while let Ok(event) = MenuEvent::receiver().try_recv() {
                    match event.id.as_ref() {
                        "open" => {
                            let _ = cx.update(show_main_window);
                        }
                        "quit" => {
                            let _ = cx.update(|cx| cx.quit());
                            return;
                        }
                        _ => {}
                    }
                }
            }
        })
        .detach();
    });
}

fn show_main_window(cx: &mut App) {
    if let Some(window) = cx.global::<DesktopState>().main_window {
        if window
            .update(cx, |_, window, _| window.activate_window())
            .is_ok()
        {
            return;
        }
    }

    match cx.open_window(WindowOptions::default(), |_, cx| cx.new(|_| AnimeVideo)) {
        Ok(window) => cx.global_mut::<DesktopState>().main_window = Some(window),
        Err(error) => eprintln!("无法创建窗口: {:?}", error),
    }
}

fn application_icon() -> Icon {
    let image = image::load_from_memory(include_bytes!("../assets/icon.png"))
        .expect("读取托盘图标失败")
        .into_rgba8();

    let (width, height) = image.dimensions();

    Icon::from_rgba(image.into_raw(), width, height).expect("转换托盘图标 RGBA 数据失败")
}
