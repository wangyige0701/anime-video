use crate::cli::{self, Service, ServiceAction, ServiceStatus, Snapshot};
use gpui::{
    Animation, AnimationExt as _, ClickEvent, Context, PathPromptOptions, Render, Subscription,
    Window, div, img, prelude::*, pulsating_between, px, rgb,
};
use std::{fs, path::PathBuf, time::Duration};

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

#[derive(Clone)]
enum PendingOperation {
    Refresh,
    ServiceAction {
        action: ServiceAction,
        services: Vec<Service>,
        global: bool,
    },
    AddDirectories,
    RemoveDirectory(usize),
}

pub struct TrayPanel {
    api: ServiceStatus,
    web: ServiceStatus,
    directories: Vec<String>,
    busy: bool,
    pending_operation: Option<PendingOperation>,
    notice: String,
    was_activated: bool,
    path_prompt_open: bool,
    _activation_subscription: Subscription,
}

impl TrayPanel {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let activation_subscription = cx.observe_window_activation(window, |panel, window, _| {
            if window.is_window_active() {
                panel.was_activated = true;
            } else if panel.was_activated && !panel.path_prompt_open {
                window.remove_window();
            }
        });
        let panel = Self {
            api: ServiceStatus::stopped(Service::Api),
            web: ServiceStatus::stopped(Service::Web),
            directories: Vec::new(),
            busy: false,
            pending_operation: None,
            notice: "正在读取状态...".to_string(),
            was_activated: false,
            path_prompt_open: false,
            _activation_subscription: activation_subscription,
        };
        let panel_entity = cx.entity();
        cx.defer(move |cx| panel_entity.update(cx, |panel, cx| panel.refresh(cx)));
        panel
    }

    fn refresh(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        self.busy = true;
        self.pending_operation = Some(PendingOperation::Refresh);
        self.notice = "正在刷新...".to_string();
        cx.notify();

        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async { cli::load_snapshot() })
                .await;
            let _ = this.update(cx, |panel, cx| {
                panel.busy = false;
                panel.pending_operation = None;
                panel.apply_snapshot(result, "状态已刷新");
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

        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    for service in services {
                        cli::run_service_action(action, Some(service))?;
                    }
                    cli::load_snapshot()
                })
                .await;
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
        matches!(self.pending_operation, Some(PendingOperation::Refresh))
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

    fn choose_directories(&mut self, _: &ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        // 系统路径选择器会让浮层暂时失焦，不能在它仍引用窗口句柄时关闭面板。
        self.path_prompt_open = true;
        self.busy = true;
        self.pending_operation = Some(PendingOperation::AddDirectories);
        self.notice = "正在选择目录...".to_string();
        cx.notify();

        let selection = cx.prompt_for_paths(PathPromptOptions {
            files: false,
            directories: true,
            multiple: true,
            prompt: Some("选择视频检索目录".into()),
        });

        cx.spawn(async move |this, cx| {
            let selection = selection.await;
            let _ = this.update(cx, |panel, cx| {
                panel.path_prompt_open = false;
                cx.notify();
            });

            let paths = match selection {
                Ok(Ok(Some(paths))) if !paths.is_empty() => paths,
                Ok(Ok(_)) => {
                    let _ = this.update(cx, |panel, cx| {
                        panel.busy = false;
                        panel.pending_operation = None;
                        panel.notice = "未添加目录".to_string();
                        cx.notify();
                    });
                    return;
                }
                Ok(Err(error)) => {
                    let _ = this.update(cx, |panel, cx| {
                        panel.busy = false;
                        panel.pending_operation = None;
                        panel.notice = compact_error(&error.to_string());
                        cx.notify();
                    });
                    return;
                }
                Err(error) => {
                    let _ = this.update(cx, |panel, cx| {
                        panel.busy = false;
                        panel.pending_operation = None;
                        panel.notice = compact_error(&error.to_string());
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

    fn apply_snapshot(&mut self, result: Result<Snapshot, String>, success_message: &str) {
        match result {
            Ok(snapshot) => {
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
            PRIMARY
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
                            .when(can_start, |element| {
                                element
                                    .cursor_pointer()
                                    .hover(|style| style.bg(rgb(PRIMARY_SOFT)))
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
                                element.child(loading_indicator(PRIMARY))
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
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
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
            shorten(&self.notice, 24)
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
                            .when(!self.busy, |element| {
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
                    .h(px(62.0))
                    .flex()
                    .flex_col()
                    .gap_2()
                    .px_3()
                    .py_2()
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
                                    .bg(rgb(if can_start_all || start_loading {
                                        PRIMARY_SOFT
                                    } else {
                                        SUBTLE
                                    }))
                                    .text_xs()
                                    .text_color(rgb(if can_start_all || start_loading {
                                        PRIMARY
                                    } else {
                                        DISABLED
                                    }))
                                    .when(can_start_all, |element| {
                                        let services = startable_services.clone();
                                        element
                                            .cursor_pointer()
                                            .hover(|style| style.bg(rgb(0xdbeafe)))
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
                                        element.child(loading_indicator(PRIMARY))
                                    })
                                    .when(!start_loading, |element| {
                                        element.child(fluent_icon(
                                            ICON_PLAY,
                                            if can_start_all { PRIMARY } else { DISABLED },
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
                            .hover(|style| style.bg(rgb(0xffedf0)).text_color(rgb(DANGER)))
                            .on_click(cx.listener(|_, _, _, cx| cx.quit()))
                            .child(fluent_icon(ICON_POWER, MUTED))
                            .child("退出"),
                    ),
            )
    }
}

fn fluent_icon(glyph: &'static str, color: u32) -> impl IntoElement {
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
    div()
        .size_4()
        .flex()
        .items_center()
        .justify_center()
        .font_family(ICON_FONT)
        .text_size(px(13.0))
        .text_color(rgb(color))
        .child(ICON_REFRESH)
        .with_animation(
            "pending-action-spinner",
            Animation::new(Duration::from_millis(700))
                .repeat()
                .with_easing(pulsating_between(0.25, 1.0)),
            |element, opacity| element.opacity(opacity),
        )
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
