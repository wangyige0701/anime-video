use crate::cli::{self, Service, ServiceAction, ServiceStatus, Snapshot};
use crate::folder_picker;
use crate::position;
use crate::state::CachedState;
use gpui::{
    Animation, AnimationExt as _, AnyView, App, ClickEvent, Context, Render, SharedString,
    Subscription, Transformation, Window, div, img, percentage, prelude::*, px, rgb, size, svg,
};
use std::{fs, path::PathBuf, time::Duration};
use tray_icon::Rect;

pub const PANEL_WIDTH: f32 = 232.0;
const PANEL_MIN_HEIGHT: f32 = 390.0;
const DIRECTORY_ROW_HEIGHT: f32 = 34.0;
const MAX_VISIBLE_DIRECTORY_ROWS: usize = 5;

const INK: u32 = 0x172033;
const MUTED: u32 = 0x748095;
const DISABLED: u32 = 0xaab2c0;
const BORDER: u32 = 0xe3e7ee;
const PANEL: u32 = 0xffffff;
const CANVAS: u32 = 0xf7f8fb;
const SUBTLE: u32 = 0xf1f3f7;
const PRIMARY: u32 = 0x3b5ccc;
const PRIMARY_SOFT: u32 = 0xeef2ff;
const SUCCESS: u32 = 0x16a34a;
const SUCCESS_SOFT: u32 = 0xecfdf3;
const WARNING: u32 = 0xd97706;
const DANGER: u32 = 0xdc2626;

const ICON_FONT: &str = "Segoe Fluent Icons";
const ICON_PLAY: &str = "\u{e768}";
const ICON_STOP: &str = "\u{e71a}";
const ICON_REFRESH: &str = "\u{e72c}";
const ICON_DOCUMENT: &str = "\u{e8a5}";
const ICON_ADD: &str = "\u{e710}";
const ICON_CLOSE: &str = "\u{e711}";
const ICON_FOLDER: &str = "\u{e8b7}";
const ICON_POWER: &str = "\u{e7e8}";
const ICON_GLOBE: &str = "\u{e774}";
const LOADING_SVG: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/assets/loading.svg");

#[derive(Clone)]
enum PendingOperation {
    ServiceAction {
        action: ServiceAction,
        services: Vec<Service>,
        global: bool,
    },
    AddDirectories,
    RemoveDirectory(usize),
}

pub struct TrayPanel {
    cache: CachedState,
    api: ServiceStatus,
    web: ServiceStatus,
    directories: Vec<String>,
    busy: bool,
    refreshing: bool,
    pending_operation: Option<PendingOperation>,
    notice: String,
    tray_rect: Rect,
    panel_height: f32,
    was_activated: bool,
    path_prompt_open: bool,
    _activation_subscription: Subscription,
    _bounds_subscription: Subscription,
}

struct HoverHint {
    text: SharedString,
}

impl Render for HoverHint {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
            .px_2()
            .py_1()
            .rounded_md()
            .bg(rgb(INK))
            .text_xs()
            .text_color(rgb(PANEL))
            .shadow_md()
            .child(self.text.clone())
    }
}

impl TrayPanel {
    pub fn new(
        cache: CachedState,
        tray_rect: Rect,
        panel_height: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let activation_subscription = cx.observe_window_activation(window, |panel, window, _| {
            if window.is_window_active() {
                panel.was_activated = true;
            } else if panel.was_activated && !panel.path_prompt_open {
                window.remove_window();
            }
        });
        let bounds_subscription = cx.observe_window_bounds(window, |panel, window, _| {
            position::bring_to_front_and_align(window, panel.tray_rect);
        });
        let cached = cache.read();
        let panel = Self {
            cache,
            api: cached.snapshot.api,
            web: cached.snapshot.web,
            directories: cached.snapshot.directories,
            busy: false,
            refreshing: false,
            pending_operation: None,
            notice: if cached.snapshot_loaded {
                "状态已就绪"
            } else {
                "正在预取状态..."
            }
            .to_string(),
            tray_rect,
            panel_height,
            was_activated: false,
            path_prompt_open: false,
            _activation_subscription: activation_subscription,
            _bounds_subscription: bounds_subscription,
        };
        let panel_entity = cx.entity();
        cx.defer(move |cx| panel_entity.update(cx, |panel, cx| panel.refresh(cx)));
        panel
    }

    fn refresh(&mut self, cx: &mut Context<Self>) {
        if self.refreshing || self.busy {
            return;
        }
        self.refreshing = true;
        self.notice = "正在刷新...".to_string();
        cx.notify();

        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async { cli::load_snapshot() })
                .await;
            let _ = this.update(cx, |panel, cx| {
                panel.refreshing = false;
                let active_notice = panel.busy.then(|| panel.notice.clone());
                panel.apply_snapshot(result, "状态已刷新");
                if let Some(notice) = active_notice {
                    panel.notice = notice;
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn run_actions(
        &mut self,
        action: ServiceAction,
        services: Vec<Service>,
        global: bool,
        cx: &mut Context<Self>,
    ) {
        if self.busy || services.is_empty() {
            return;
        }

        self.busy = true;
        self.pending_operation = Some(PendingOperation::ServiceAction {
            action,
            services: services.clone(),
            global,
        });
        let target = if services.len() == 1 {
            services[0].label().to_string()
        } else {
            format!("{}项服务", services.len())
        };
        self.notice = format!("正在{}{}...", action.label(), target);
        cx.notify();

        let cache = self.cache.clone();
        // 任务由应用执行器持有，面板关闭只会让最后的界面更新失败，不会取消 CLI 命令。
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    if global && action == ServiceAction::Start {
                        cli::run_service_action(action, None)?;
                    } else {
                        for service in services {
                            cli::run_service_action(action, Some(service))?;
                        }
                    }
                    cli::load_snapshot()
                })
                .await;
            if let Ok(snapshot) = &result {
                cache.update_snapshot(snapshot.clone());
            }
            let _ = this.update(cx, |panel, cx| {
                panel.busy = false;
                panel.pending_operation = None;
                panel.apply_snapshot(result, "服务操作完成");
                cx.notify();
            });
        })
        .detach();
    }

    fn startable_services(&self) -> Vec<Service> {
        [Service::Web, Service::Api]
            .into_iter()
            .filter(|service| is_startable(&self.status_for(*service).state))
            .collect()
    }

    fn running_services(&self) -> Vec<Service> {
        [Service::Web, Service::Api]
            .into_iter()
            .filter(|service| self.status_for(*service).state == "running")
            .collect()
    }

    fn is_refreshing(&self) -> bool {
        self.refreshing
    }

    fn is_global_action_loading(&self, action: ServiceAction) -> bool {
        matches!(
            &self.pending_operation,
            Some(PendingOperation::ServiceAction {
                action: pending_action,
                global: true,
                ..
            }) if *pending_action == action
        )
    }

    fn is_service_action_loading(&self, service: Service, action: ServiceAction) -> bool {
        matches!(
            &self.pending_operation,
            Some(PendingOperation::ServiceAction {
                action: pending_action,
                services,
                global: false,
            }) if *pending_action == action && services.contains(&service)
        )
    }

    fn is_adding_directories(&self) -> bool {
        matches!(
            self.pending_operation,
            Some(PendingOperation::AddDirectories)
        )
    }

    fn is_removing_directory(&self, index: usize) -> bool {
        matches!(
            self.pending_operation,
            Some(PendingOperation::RemoveDirectory(pending_index)) if pending_index == index
        )
    }

    fn choose_directories(&mut self, _: &ClickEvent, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        // 系统选择器使用独立 STA 消息循环；选择期间隐藏面板，避免置顶浮层遮挡对话框。
        self.path_prompt_open = true;
        self.busy = true;
        self.pending_operation = Some(PendingOperation::AddDirectories);
        self.notice = "正在选择目录...".to_string();
        cx.notify();

        let panel_handle = position::window_handle(window);
        position::set_topmost_handle(panel_handle, false);
        position::set_visible_handle(panel_handle, false);
        let selection = folder_picker::choose_directories();

        cx.spawn(async move |this, cx| {
            let selection = selection
                .recv()
                .await
                .unwrap_or_else(|_| Err("目录选择器意外关闭，请重试".to_string()));
            let _ = this.update(cx, |panel, cx| {
                panel.path_prompt_open = false;
                cx.notify();
            });
            position::set_visible_handle(panel_handle, true);
            position::set_topmost_handle(panel_handle, true);

            let paths = match selection {
                Ok(Some(paths)) if !paths.is_empty() => paths,
                Ok(_) => {
                    let _ = this.update(cx, |panel, cx| {
                        panel.busy = false;
                        panel.pending_operation = None;
                        panel.notice = "已取消添加目录".to_string();
                        cx.notify();
                    });
                    return;
                }
                Err(error) => {
                    let _ = this.update(cx, |panel, cx| {
                        panel.busy = false;
                        panel.pending_operation = None;
                        panel.notice = compact_error(&error);
                        cx.notify();
                    });
                    return;
                }
            };
            let directories = paths
                .iter()
                .map(|path| path.to_string_lossy().to_string())
                .collect::<Vec<_>>();
            let result = cx
                .background_executor()
                .spawn(async move {
                    cli::add_directories(&directories)?;
                    cli::load_snapshot()
                })
                .await;
            let _ = this.update(cx, |panel, cx| {
                panel.busy = false;
                panel.pending_operation = None;
                panel.apply_snapshot(result, "目录已更新");
                cx.notify();
            });
        })
        .detach();
    }

    fn remove_directory(&mut self, index: usize, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        self.busy = true;
        self.pending_operation = Some(PendingOperation::RemoveDirectory(index));
        self.notice = "正在删除目录...".to_string();
        cx.notify();

        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    cli::delete_directory(index)?;
                    cli::load_snapshot()
                })
                .await;
            let _ = this.update(cx, |panel, cx| {
                panel.busy = false;
                panel.pending_operation = None;
                panel.apply_snapshot(result, "目录已删除");
                cx.notify();
            });
        })
        .detach();
    }

    fn reveal_logs(&mut self, service: Service, cx: &mut Context<Self>) {
        let directory = cli::log_directory(service);
        match fs::create_dir_all(&directory) {
            Ok(()) => {
                cx.reveal_path(&directory);
                self.notice = format!("已打开{}日志", service.label());
            }
            Err(error) => self.notice = compact_error(&error.to_string()),
        }
        cx.notify();
    }

    fn open_web(&mut self, cx: &mut Context<Self>) {
        if let Some(web_url) = self.cache.read().web_url {
            cx.open_url(&web_url);
            self.notice = "已在浏览器打开网页".to_string();
        } else {
            self.notice = "网页地址尚未就绪".to_string();
        }
        cx.notify();
    }

    fn apply_snapshot(&mut self, result: Result<Snapshot, String>, success_message: &str) {
        match result {
            Ok(snapshot) => {
                self.cache.update_snapshot(snapshot.clone());
                self.api = snapshot.api;
                self.web = snapshot.web;
                self.directories = snapshot.directories;
                self.notice = success_message.to_string();
            }
            Err(error) => self.notice = compact_error(&error),
        }
    }

    fn status_for(&self, service: Service) -> &ServiceStatus {
        match service {
            Service::Api => &self.api,
            Service::Web => &self.web,
        }
    }

    fn aggregate_status(&self) -> (u32, &'static str) {
        let running = [&self.web, &self.api]
            .iter()
            .filter(|status| status.state == "running")
            .count();
        let has_error = [&self.web, &self.api]
            .iter()
            .any(|status| matches!(status.state.as_str(), "failed" | "backoff"));

        if has_error {
            (DANGER, "服务异常")
        } else {
            match running {
                2 => (SUCCESS, "全部运行中"),
                1 => (WARNING, "已运行 1/2"),
                _ => (MUTED, "全部已停止"),
            }
        }
    }

    fn resize_for_directories(&mut self, window: &mut Window) {
        let height = panel_height_for_directory_count(self.directories.len());
        if (height - self.panel_height).abs() < f32::EPSILON {
            return;
        }
        self.panel_height = height;
        window.resize(size(px(PANEL_WIDTH), px(height)));
    }

    fn service_row(&self, service: Service, cx: &mut Context<Self>) -> impl IntoElement {
        let status = self.status_for(service);
        let (color, label) = status_presentation(&status.state);
        let service_key = service.key();
        let can_start = !self.busy && is_startable(&status.state);
        let can_stop_or_restart = !self.busy && status.state == "running";
        let start_loading = self.is_service_action_loading(service, ServiceAction::Start);
        let stop_loading = self.is_service_action_loading(service, ServiceAction::Stop);
        let restart_loading = self.is_service_action_loading(service, ServiceAction::Restart);
        let start_color = if can_start || start_loading {
            SUCCESS
        } else {
            DISABLED
        };
        let stop_color = if can_stop_or_restart || stop_loading {
            DANGER
        } else {
            DISABLED
        };
        let restart_color = if can_stop_or_restart || restart_loading {
            WARNING
        } else {
            DISABLED
        };

        div()
            .id(("service-row", service_key))
            .h(px(52.0))
            .flex()
            .items_center()
            .px_3()
            .bg(rgb(PANEL))
            .border_b_1()
            .border_color(rgb(BORDER))
            .child(
                div()
                    .flex_1()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(div().size_2().rounded_full().bg(rgb(color)))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .child(
                                div()
                                    .text_xs()
                                    .font_weight(gpui::FontWeight::SEMIBOLD)
                                    .text_color(rgb(INK))
                                    .child(service.label()),
                            )
                            .child(div().text_xs().text_color(rgb(color)).child(label)),
                    ),
            )
            .child(
                div()
                    .flex()
                    .justify_end()
                    .gap_1()
                    .child(
                        div()
                            .id(("start", service_key))
                            .w(px(28.0))
                            .h(px(28.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded_md()
                            .tooltip(tooltip(format!("启动{}", service.label())))
                            .when(can_start, |element| {
                                element
                                    .cursor_pointer()
                                    .hover(|style| style.bg(rgb(SUCCESS_SOFT)))
                                    .on_click(cx.listener(move |panel, _, _, cx| {
                                        panel.run_actions(
                                            ServiceAction::Start,
                                            vec![service],
                                            false,
                                            cx,
                                        )
                                    }))
                            })
                            .when(start_loading, |element| {
                                element.child(loading_indicator(SUCCESS))
                            })
                            .when(!start_loading, |element| {
                                element.child(fluent_icon(ICON_PLAY, start_color))
                            }),
                    )
                    .child(
                        div()
                            .id(("stop", service_key))
                            .w(px(28.0))
                            .h(px(28.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded_md()
                            .tooltip(tooltip(format!("停止{}", service.label())))
                            .when(can_stop_or_restart, |element| {
                                element
                                    .cursor_pointer()
                                    .hover(|style| style.bg(rgb(0xffedf0)))
                                    .on_click(cx.listener(move |panel, _, _, cx| {
                                        panel.run_actions(
                                            ServiceAction::Stop,
                                            vec![service],
                                            false,
                                            cx,
                                        )
                                    }))
                            })
                            .when(stop_loading, |element| {
                                element.child(loading_indicator(DANGER))
                            })
                            .when(!stop_loading, |element| {
                                element.child(fluent_icon(ICON_STOP, stop_color))
                            }),
                    )
                    .child(
                        div()
                            .id(("restart", service_key))
                            .w(px(28.0))
                            .h(px(28.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded_md()
                            .tooltip(tooltip(format!("重启{}", service.label())))
                            .when(can_stop_or_restart, |element| {
                                element
                                    .cursor_pointer()
                                    .hover(|style| style.bg(rgb(0xfff3e6)))
                                    .on_click(cx.listener(move |panel, _, _, cx| {
                                        panel.run_actions(
                                            ServiceAction::Restart,
                                            vec![service],
                                            false,
                                            cx,
                                        )
                                    }))
                            })
                            .when(restart_loading, |element| {
                                element.child(loading_indicator(WARNING))
                            })
                            .when(!restart_loading, |element| {
                                element.child(fluent_icon(ICON_REFRESH, restart_color))
                            }),
                    )
                    .child(
                        div()
                            .id(("logs", service_key))
                            .w(px(28.0))
                            .h(px(28.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .rounded_md()
                            .tooltip(tooltip(format!("打开{}日志文件夹", service.label())))
                            .hover(|style| style.bg(rgb(SUBTLE)).text_color(rgb(INK)))
                            .on_click(
                                cx.listener(move |panel, _, _, cx| panel.reveal_logs(service, cx)),
                            )
                            .child(fluent_icon(ICON_DOCUMENT, MUTED)),
                    ),
            )
    }
}

impl Render for TrayPanel {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.resize_for_directories(window);
        let directories = self.directories.clone();
        let (overall_color, overall_label) = self.aggregate_status();
        let startable_services = self.startable_services();
        let running_services = self.running_services();
        let running_count = running_services.len();
        let can_start_all = !self.busy && !startable_services.is_empty();
        let can_stop_all = !self.busy && !running_services.is_empty();
        let refreshing = self.is_refreshing();
        let start_loading = self.is_global_action_loading(ServiceAction::Start);
        let stop_loading = self.is_global_action_loading(ServiceAction::Stop);
        let restart_loading = self.is_global_action_loading(ServiceAction::Restart);
        let adding_directories = self.is_adding_directories();
        let show_web_entry = self.web.state == "running" && self.cache.read().web_url.is_some();
        let start_label = if start_loading {
            "启动中".to_string()
        } else {
            action_label("启动", startable_services.len())
        };
        let stop_label = if stop_loading {
            "停止中".to_string()
        } else {
            action_label("停止", running_services.len())
        };
        let restart_label = if restart_loading {
            "重启中".to_string()
        } else {
            action_label("重启", running_services.len())
        };
        let notice = if self.busy {
            "处理中...".to_string()
        } else {
            shorten(&self.notice, 14)
        };

        div()
            .id("tray-panel")
            .size_full()
            .flex()
            .flex_col()
            .overflow_hidden()
            .bg(rgb(CANVAS))
            .border_1()
            .border_color(rgb(BORDER))
            .rounded_lg()
            .shadow_lg()
            .text_color(rgb(INK))
            .child(
                div()
                    .h(px(62.0))
                    .flex()
                    .items_center()
                    .px_3()
                    .gap_3()
                    .bg(rgb(PANEL))
                    .border_b_1()
                    .border_color(rgb(BORDER))
                    .child(
                        div()
                            .size_8()
                            .overflow_hidden()
                            .rounded_lg()
                            .border_1()
                            .border_color(rgb(BORDER))
                            .child(
                                img(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                                    .join("assets/icon.png"))
                                .size_full(),
                            ),
                    )
                    .child(
                        div()
                            .flex_1()
                            .flex()
                            .flex_col()
                            .gap_0p5()
                            .child(
                                div()
                                    .text_sm()
                                    .font_weight(gpui::FontWeight::SEMIBOLD)
                                    .child("动画管理服务"),
                            )
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap_1()
                                    .text_xs()
                                    .text_color(rgb(MUTED))
                                    .child(div().size_2().rounded_full().bg(rgb(overall_color)))
                                    .child(format!("{}  {}/2", overall_label, running_count)),
                            ),
                    )
                    .child(
                        div()
                            .id("refresh")
                            .size_7()
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded_md()
                            .tooltip(tooltip("刷新服务状态"))
                            .when(!self.busy && !refreshing, |element| {
                                element
                                    .cursor_pointer()
                                    .hover(|style| style.bg(rgb(SUBTLE)))
                                    .on_click(cx.listener(|panel, _, _, cx| panel.refresh(cx)))
                            })
                            .when(refreshing, |element| {
                                element.child(loading_indicator(MUTED))
                            })
                            .when(!refreshing, |element| {
                                element.child(fluent_icon(ICON_REFRESH, MUTED))
                            }),
                    ),
            )
            .child(
                div()
                    .h(px(73.0))
                    .flex()
                    .flex_col()
                    .gap_2()
                    .px_3()
                    .pt_2()
                    .pb(px(13.0))
                    .bg(rgb(CANVAS))
                    .border_b_1()
                    .border_color(rgb(BORDER))
                    .child(
                        div()
                            .flex()
                            .justify_between()
                            .text_xs()
                            .text_color(rgb(MUTED))
                            .child(
                                div()
                                    .font_weight(gpui::FontWeight::SEMIBOLD)
                                    .text_color(rgb(INK))
                                    .child("全局控制"),
                            )
                            .child(if self.busy {
                                "正在处理"
                            } else {
                                "按当前状态执行"
                            }),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_2()
                            .child(
                                div()
                                    .id("all-start")
                                    .flex_1()
                                    .h(px(28.0))
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .gap_1()
                                    .rounded_md()
                                    .tooltip(tooltip("启动所有未运行的服务"))
                                    .bg(rgb(if can_start_all || start_loading {
                                        SUCCESS_SOFT
                                    } else {
                                        SUBTLE
                                    }))
                                    .text_xs()
                                    .text_color(rgb(if can_start_all || start_loading {
                                        SUCCESS
                                    } else {
                                        DISABLED
                                    }))
                                    .when(can_start_all, |element| {
                                        let services = startable_services.clone();
                                        element
                                            .cursor_pointer()
                                            .hover(|style| style.bg(rgb(0xdcfce7)))
                                            .on_click(cx.listener(move |panel, _, _, cx| {
                                                panel.run_actions(
                                                    ServiceAction::Start,
                                                    services.clone(),
                                                    true,
                                                    cx,
                                                )
                                            }))
                                    })
                                    .when(start_loading, |element| {
                                        element.child(loading_indicator(SUCCESS))
                                    })
                                    .when(!start_loading, |element| {
                                        element.child(fluent_icon(
                                            ICON_PLAY,
                                            if can_start_all { SUCCESS } else { DISABLED },
                                        ))
                                    })
                                    .child(start_label),
                            )
                            .child(
                                div()
                                    .id("all-stop")
                                    .flex_1()
                                    .h(px(28.0))
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .gap_1()
                                    .rounded_md()
                                    .tooltip(tooltip("停止所有运行中的服务"))
                                    .bg(rgb(if can_stop_all || stop_loading {
                                        0xffedf0
                                    } else {
                                        SUBTLE
                                    }))
                                    .text_xs()
                                    .text_color(rgb(if can_stop_all || stop_loading {
                                        DANGER
                                    } else {
                                        DISABLED
                                    }))
                                    .when(can_stop_all, |element| {
                                        let services = running_services.clone();
                                        element
                                            .cursor_pointer()
                                            .hover(|style| style.bg(rgb(0xffe1e6)))
                                            .on_click(cx.listener(move |panel, _, _, cx| {
                                                panel.run_actions(
                                                    ServiceAction::Stop,
                                                    services.clone(),
                                                    true,
                                                    cx,
                                                )
                                            }))
                                    })
                                    .when(stop_loading, |element| {
                                        element.child(loading_indicator(DANGER))
                                    })
                                    .when(!stop_loading, |element| {
                                        element.child(fluent_icon(
                                            ICON_STOP,
                                            if can_stop_all { DANGER } else { DISABLED },
                                        ))
                                    })
                                    .child(stop_label),
                            )
                            .child(
                                div()
                                    .id("all-restart")
                                    .flex_1()
                                    .h(px(28.0))
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .gap_1()
                                    .rounded_md()
                                    .tooltip(tooltip("重启所有运行中的服务"))
                                    .bg(rgb(if can_stop_all || restart_loading {
                                        0xfff3e6
                                    } else {
                                        SUBTLE
                                    }))
                                    .text_xs()
                                    .text_color(rgb(if can_stop_all || restart_loading {
                                        WARNING
                                    } else {
                                        DISABLED
                                    }))
                                    .when(can_stop_all, |element| {
                                        let services = running_services.clone();
                                        element
                                            .cursor_pointer()
                                            .hover(|style| style.bg(rgb(0xffead5)))
                                            .on_click(cx.listener(move |panel, _, _, cx| {
                                                panel.run_actions(
                                                    ServiceAction::Restart,
                                                    services.clone(),
                                                    true,
                                                    cx,
                                                )
                                            }))
                                    })
                                    .when(restart_loading, |element| {
                                        element.child(loading_indicator(WARNING))
                                    })
                                    .when(!restart_loading, |element| {
                                        element.child(fluent_icon(
                                            ICON_REFRESH,
                                            if can_stop_all { WARNING } else { DISABLED },
                                        ))
                                    })
                                    .child(restart_label),
                            ),
                    ),
            )
            .child(
                div()
                    .h(px(28.0))
                    .flex()
                    .items_center()
                    .justify_between()
                    .px_3()
                    .bg(rgb(PANEL))
                    .text_xs()
                    .text_color(rgb(MUTED))
                    .child(
                        div()
                            .font_weight(gpui::FontWeight::SEMIBOLD)
                            .text_color(rgb(INK))
                            .child("服务状态"),
                    )
                    .child(format!("已运行 {}/2", running_count)),
            )
            .child(self.service_row(Service::Web, cx))
            .child(self.service_row(Service::Api, cx))
            .child(
                div()
                    .h(px(32.0))
                    .flex()
                    .items_center()
                    .justify_between()
                    .px_3()
                    .bg(rgb(CANVAS))
                    .border_t_1()
                    .border_b_1()
                    .border_color(rgb(BORDER))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_2()
                            .text_xs()
                            .font_weight(gpui::FontWeight::SEMIBOLD)
                            .child("视频目录")
                            .child(
                                div()
                                    .min_w(px(18.0))
                                    .h(px(18.0))
                                    .px_1()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .rounded_full()
                                    .bg(rgb(SUBTLE))
                                    .text_color(rgb(MUTED))
                                    .child(directories.len().to_string()),
                            ),
                    )
                    .child(
                        div()
                            .id("add-directory")
                            .size_7()
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded_md()
                            .tooltip(tooltip("添加视频目录"))
                            .when(!self.busy, |element| {
                                element
                                    .cursor_pointer()
                                    .hover(|style| style.bg(rgb(PRIMARY_SOFT)))
                                    .on_click(cx.listener(Self::choose_directories))
                            })
                            .when(adding_directories, |element| {
                                element.child(loading_indicator(PRIMARY))
                            })
                            .when(!adding_directories, |element| {
                                element.child(fluent_icon(
                                    ICON_ADD,
                                    if self.busy { DISABLED } else { PRIMARY },
                                ))
                            }),
                    ),
            )
            .child(
                div()
                    .id("directory-list")
                    .flex_1()
                    .overflow_y_scroll()
                    .bg(rgb(PANEL))
                    .px_3()
                    .children(directories.iter().enumerate().map(|(index, directory)| {
                        let removing_directory = self.is_removing_directory(index);
                        div()
                            .id(("directory", index))
                            .h(px(34.0))
                            .flex()
                            .items_center()
                            .gap_2()
                            .border_b_1()
                            .border_color(rgb(BORDER))
                            .child(fluent_icon(ICON_FOLDER, MUTED))
                            .child(
                                div()
                                    .flex_1()
                                    .text_xs()
                                    .text_color(rgb(MUTED))
                                    .child(shorten(directory, 22)),
                            )
                            .child(
                                div()
                                    .id(("remove-directory", index))
                                    .size_7()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .rounded_md()
                                    .tooltip(tooltip("删除此视频目录"))
                                    .when(!self.busy, |element| {
                                        element
                                            .cursor_pointer()
                                            .hover(|style| {
                                                style.bg(rgb(0xffedf0)).text_color(rgb(DANGER))
                                            })
                                            .on_click(cx.listener(move |panel, _, _, cx| {
                                                panel.remove_directory(index, cx)
                                            }))
                                    })
                                    .when(removing_directory, |element| {
                                        element.child(loading_indicator(DANGER))
                                    })
                                    .when(!removing_directory, |element| {
                                        element.child(fluent_icon(
                                            ICON_CLOSE,
                                            if self.busy { DISABLED } else { DANGER },
                                        ))
                                    }),
                            )
                    }))
                    .when(directories.is_empty(), |element| {
                        element.child(
                            div()
                                .h_full()
                                .flex()
                                .items_center()
                                .justify_center()
                                .gap_2()
                                .text_xs()
                                .text_color(rgb(MUTED))
                                .child(fluent_icon(ICON_FOLDER, MUTED))
                                .child("未添加视频目录"),
                        )
                    }),
            )
            .child(
                div()
                    .h(px(36.0))
                    .flex()
                    .items_center()
                    .justify_between()
                    .px_3()
                    .bg(rgb(CANVAS))
                    .border_t_1()
                    .border_color(rgb(BORDER))
                    .text_xs()
                    .text_color(rgb(MUTED))
                    .child(div().flex_1().child(notice))
                    .when(show_web_entry, |element| {
                        element.child(
                            div()
                                .id("open-web")
                                .h(px(26.0))
                                .flex()
                                .items_center()
                                .gap_1()
                                .px_2()
                                .cursor_pointer()
                                .rounded_md()
                                .tooltip(tooltip("在默认浏览器打开网页"))
                                .text_color(rgb(PRIMARY))
                                .hover(|style| style.bg(rgb(PRIMARY_SOFT)))
                                .on_click(cx.listener(|panel, _, _, cx| panel.open_web(cx)))
                                .child(fluent_icon(ICON_GLOBE, PRIMARY))
                                .child("网页"),
                        )
                    })
                    .child(
                        div()
                            .id("quit")
                            .h(px(26.0))
                            .flex()
                            .items_center()
                            .gap_1()
                            .px_2()
                            .cursor_pointer()
                            .rounded_md()
                            .tooltip(tooltip("停止全部服务并退出"))
                            .hover(|style| style.bg(rgb(0xffedf0)).text_color(rgb(DANGER)))
                            .on_click(cx.listener(|_, _, _, cx| cx.quit()))
                            .child(fluent_icon(ICON_POWER, MUTED))
                            .child("退出"),
                    ),
            )
    }
}

fn tooltip(text: impl Into<SharedString>) -> impl Fn(&mut Window, &mut App) -> AnyView {
    let text = text.into();
    move |_, cx| {
        let text = text.clone();
        cx.new(|_| HoverHint { text }).into()
    }
}

fn fluent_icon(glyph: &'static str, color: u32) -> gpui::Div {
    div()
        .size_4()
        .flex()
        .items_center()
        .justify_center()
        .font_family(ICON_FONT)
        .text_size(px(13.0))
        .text_color(rgb(color))
        .child(glyph)
}

fn loading_indicator(color: u32) -> impl IntoElement {
    svg()
        .size_4()
        .path(LOADING_SVG)
        .text_color(rgb(color))
        .with_animation(
            "pending-action-spinner",
            Animation::new(Duration::from_millis(1_200)).repeat(),
            |element, delta| element.with_transformation(Transformation::rotate(percentage(delta))),
        )
}

pub fn panel_height_for_directory_count(directory_count: usize) -> f32 {
    let visible_rows = directory_count.clamp(1, MAX_VISIBLE_DIRECTORY_ROWS);
    PANEL_MIN_HEIGHT + (visible_rows.saturating_sub(1) as f32 * DIRECTORY_ROW_HEIGHT)
}

fn status_presentation(state: &str) -> (u32, &'static str) {
    match state {
        "running" => (SUCCESS, "运行中"),
        "starting" => (WARNING, "启动中"),
        "stopping" => (WARNING, "停止中"),
        "failed" | "backoff" => (DANGER, "异常"),
        _ => (MUTED, "已停止"),
    }
}

fn is_startable(state: &str) -> bool {
    matches!(state, "stopped" | "failed" | "backoff")
}

fn action_label(action: &str, count: usize) -> String {
    if count == 0 {
        action.to_string()
    } else {
        format!("{} {}", action, count)
    }
}

fn compact_error(error: &str) -> String {
    if error.contains("ENOMEM") {
        return "运行环境内存不足".to_string();
    }

    let detail = error
        .lines()
        .rev()
        .find(|line| {
            let line = line.trim();
            !line.is_empty()
                && (line.contains("Error")
                    || line.contains("error")
                    || line.contains("失败")
                    || line.contains("无法")
                    || line.contains("ENO"))
        })
        .or_else(|| error.lines().find(|line| !line.trim().is_empty()))
        .unwrap_or("操作失败")
        .trim();
    if detail
        .chars()
        .any(|character| character.is_ascii_alphabetic())
    {
        "服务操作失败".to_string()
    } else {
        format!("操作失败：{}", shorten(detail, 34))
    }
}

fn shorten(value: &str, limit: usize) -> String {
    let count = value.chars().count();
    if count <= limit {
        return value.to_string();
    }
    format!(
        "{}...",
        value
            .chars()
            .take(limit.saturating_sub(3))
            .collect::<String>()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn panel_height_grows_until_directory_limit() {
        assert_eq!(panel_height_for_directory_count(0), PANEL_MIN_HEIGHT);
        assert_eq!(panel_height_for_directory_count(1), PANEL_MIN_HEIGHT);
        assert_eq!(panel_height_for_directory_count(2), 424.0);
        assert_eq!(panel_height_for_directory_count(5), 526.0);
        assert_eq!(panel_height_for_directory_count(8), 526.0);
    }
}
