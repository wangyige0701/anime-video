use crate::cli::{self, Service, ServiceAction, ServiceStatus, Snapshot};
use gpui::{
    ClickEvent, Context, PathPromptOptions, Render, Subscription, Window, div, prelude::*, px, rgb,
};
use std::fs;

const INK: u32 = 0x172033;
const MUTED: u32 = 0x7a8496;
const BORDER: u32 = 0xe4e8ef;
const PANEL: u32 = 0xffffff;
const SUBTLE: u32 = 0xf6f8fb;
const PRIMARY: u32 = 0x2563eb;
const SUCCESS: u32 = 0x16a34a;
const WARNING: u32 = 0xd97706;
const DANGER: u32 = 0xdc2626;

pub struct TrayPanel {
    api: ServiceStatus,
    web: ServiceStatus,
    directories: Vec<String>,
    busy: bool,
    notice: String,
    was_activated: bool,
    _activation_subscription: Subscription,
}

impl TrayPanel {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let activation_subscription = cx.observe_window_activation(window, |panel, window, _| {
            if window.is_window_active() {
                panel.was_activated = true;
            } else if panel.was_activated {
                window.remove_window();
            }
        });
        let panel = Self {
            api: ServiceStatus::stopped(Service::Api),
            web: ServiceStatus::stopped(Service::Web),
            directories: Vec::new(),
            busy: false,
            notice: "正在读取状态...".to_string(),
            was_activated: false,
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
        self.notice = "正在刷新...".to_string();
        cx.notify();

        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async { cli::load_snapshot() })
                .await;
            let _ = this.update(cx, |panel, cx| {
                panel.busy = false;
                panel.apply_snapshot(result, "状态已刷新");
                cx.notify();
            });
        })
        .detach();
    }

    fn run_action(
        &mut self,
        action: ServiceAction,
        service: Option<Service>,
        cx: &mut Context<Self>,
    ) {
        if self.busy {
            return;
        }

        self.busy = true;
        let target = service.map(Service::label).unwrap_or("全部服务");
        self.notice = format!("正在{}{}...", action.label(), target);
        cx.notify();

        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    cli::run_service_action(action, service)?;
                    cli::load_snapshot()
                })
                .await;
            let _ = this.update(cx, |panel, cx| {
                panel.busy = false;
                panel.apply_snapshot(result, "服务操作完成");
                cx.notify();
            });
        })
        .detach();
    }

    fn choose_directories(&mut self, _: &ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        let selection = cx.prompt_for_paths(PathPromptOptions {
            files: false,
            directories: true,
            multiple: true,
            prompt: Some("选择视频检索目录".into()),
        });
        self.busy = true;
        self.notice = "正在选择目录...".to_string();
        cx.notify();

        cx.spawn(async move |this, cx| {
            let paths = match selection.await {
                Ok(Ok(Some(paths))) if !paths.is_empty() => paths,
                Ok(Ok(_)) => {
                    let _ = this.update(cx, |panel, cx| {
                        panel.busy = false;
                        panel.notice = "未添加目录".to_string();
                        cx.notify();
                    });
                    return;
                }
                Ok(Err(error)) => {
                    let _ = this.update(cx, |panel, cx| {
                        panel.busy = false;
                        panel.notice = compact_error(&error.to_string());
                        cx.notify();
                    });
                    return;
                }
                Err(error) => {
                    let _ = this.update(cx, |panel, cx| {
                        panel.busy = false;
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
                1 => (WARNING, "1 项运行中"),
                _ => (MUTED, "全部已停止"),
            }
        }
    }

    fn service_row(&self, service: Service, cx: &mut Context<Self>) -> impl IntoElement {
        let status = self.status_for(service);
        let (color, label) = status_presentation(&status.state);
        let service_key = service.key();
        let can_stop_or_restart = status.state == "running";
        let action_color = if can_stop_or_restart { DANGER } else { MUTED };
        let restart_color = if can_stop_or_restart { WARNING } else { MUTED };

        div()
            .id(("service-row", service_key))
            .h(px(48.0))
            .flex()
            .items_center()
            .gap_1()
            .px_2()
            .border_b_1()
            .border_color(rgb(BORDER))
            .child(
                div()
                    .w(px(76.0))
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
                    .flex_1()
                    .flex()
                    .justify_end()
                    .gap_1()
                    .child(
                        div()
                            .id(("start", service_key))
                            .w(px(24.0))
                            .h(px(24.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .rounded_md()
                            .text_sm()
                            .text_color(rgb(PRIMARY))
                            .hover(|style| style.bg(rgb(0xeaf2ff)))
                            .on_click(cx.listener(move |panel, _, _, cx| {
                                panel.run_action(ServiceAction::Start, Some(service), cx)
                            }))
                            .child("▶"),
                    )
                    .child(
                        div()
                            .id(("stop", service_key))
                            .w(px(24.0))
                            .h(px(24.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded_md()
                            .text_sm()
                            .text_color(rgb(action_color))
                            .when(can_stop_or_restart, |element| {
                                element
                                    .cursor_pointer()
                                    .hover(|style| style.bg(rgb(0xffedf0)))
                                    .on_click(cx.listener(move |panel, _, _, cx| {
                                        panel.run_action(ServiceAction::Stop, Some(service), cx)
                                    }))
                            })
                            .child("■"),
                    )
                    .child(
                        div()
                            .id(("restart", service_key))
                            .w(px(24.0))
                            .h(px(24.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded_md()
                            .text_sm()
                            .text_color(rgb(restart_color))
                            .when(can_stop_or_restart, |element| {
                                element
                                    .cursor_pointer()
                                    .hover(|style| style.bg(rgb(0xfff3e6)))
                                    .on_click(cx.listener(move |panel, _, _, cx| {
                                        panel.run_action(ServiceAction::Restart, Some(service), cx)
                                    }))
                            })
                            .child("↻"),
                    )
                    .child(
                        div()
                            .id(("logs", service_key))
                            .h(px(24.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .rounded_md()
                            .px_1()
                            .text_xs()
                            .text_color(rgb(MUTED))
                            .hover(|style| style.bg(rgb(SUBTLE)).text_color(rgb(INK)))
                            .on_click(
                                cx.listener(move |panel, _, _, cx| panel.reveal_logs(service, cx)),
                            )
                            .child("日志"),
                    ),
            )
    }
}

impl Render for TrayPanel {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let directories = self.directories.clone();
        let (overall_color, overall_label) = self.aggregate_status();
        let has_running_service = self.web.state == "running" || self.api.state == "running";
        let all_stop_color = if has_running_service { DANGER } else { MUTED };
        let all_restart_color = if has_running_service { WARNING } else { MUTED };
        let notice = if self.busy {
            "处理中...".to_string()
        } else {
            shorten(&self.notice, 42)
        };

        div()
            .id("tray-panel")
            .size_full()
            .flex()
            .flex_col()
            .overflow_hidden()
            .bg(rgb(PANEL))
            .border_1()
            .border_color(rgb(BORDER))
            .rounded_lg()
            .shadow_lg()
            .text_color(rgb(INK))
            .child(
                div()
                    .h(px(42.0))
                    .flex()
                    .items_center()
                    .px_2()
                    .gap_1()
                    .border_b_1()
                    .border_color(rgb(BORDER))
                    .child(
                        div()
                            .flex_1()
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
                            .child(overall_label),
                    )
                    .child(
                        div()
                            .id("refresh")
                            .w(px(24.0))
                            .h(px(24.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .rounded_md()
                            .text_base()
                            .text_color(rgb(MUTED))
                            .hover(|style| style.bg(rgb(SUBTLE)).text_color(rgb(INK)))
                            .on_click(cx.listener(|panel, _, _, cx| panel.refresh(cx)))
                            .child("↻"),
                    ),
            )
            .child(
                div()
                    .h(px(40.0))
                    .flex()
                    .items_center()
                    .gap_1()
                    .px_2()
                    .border_b_1()
                    .border_color(rgb(BORDER))
                    .child(
                        div()
                            .id("all-start")
                            .flex_1()
                            .h(px(26.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .gap_1()
                            .cursor_pointer()
                            .rounded_md()
                            .bg(rgb(0xeaf2ff))
                            .text_xs()
                            .text_color(rgb(PRIMARY))
                            .hover(|style| style.bg(rgb(0xdbeafe)))
                            .on_click(cx.listener(|panel, _, _, cx| {
                                panel.run_action(ServiceAction::Start, None, cx)
                            }))
                            .child("▶ 启动"),
                    )
                    .child(
                        div()
                            .id("all-stop")
                            .flex_1()
                            .h(px(26.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .gap_1()
                            .rounded_md()
                            .bg(rgb(0xffedf0))
                            .text_xs()
                            .text_color(rgb(all_stop_color))
                            .when(has_running_service, |element| {
                                element
                                    .cursor_pointer()
                                    .hover(|style| style.bg(rgb(0xffe1e6)))
                                    .on_click(cx.listener(|panel, _, _, cx| {
                                        panel.run_action(ServiceAction::Stop, None, cx)
                                    }))
                            })
                            .child("■ 停止"),
                    )
                    .child(
                        div()
                            .id("all-restart")
                            .flex_1()
                            .h(px(26.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .gap_1()
                            .rounded_md()
                            .bg(rgb(0xfff3e6))
                            .text_xs()
                            .text_color(rgb(all_restart_color))
                            .when(has_running_service, |element| {
                                element
                                    .cursor_pointer()
                                    .hover(|style| style.bg(rgb(0xffead5)))
                                    .on_click(cx.listener(|panel, _, _, cx| {
                                        panel.run_action(ServiceAction::Restart, None, cx)
                                    }))
                            })
                            .child("↻ 重启"),
                    ),
            )
            .child(self.service_row(Service::Web, cx))
            .child(self.service_row(Service::Api, cx))
            .child(
                div()
                    .h(px(34.0))
                    .flex()
                    .items_center()
                    .justify_between()
                    .px_2()
                    .child(
                        div()
                            .text_xs()
                            .font_weight(gpui::FontWeight::SEMIBOLD)
                            .child("视频检索目录"),
                    )
                    .child(
                        div()
                            .id("add-directory")
                            .h(px(24.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .rounded_md()
                            .px_1()
                            .text_xs()
                            .text_color(rgb(PRIMARY))
                            .hover(|style| style.bg(rgb(0xeaf2ff)))
                            .on_click(cx.listener(Self::choose_directories))
                            .child("＋"),
                    ),
            )
            .child(
                div()
                    .id("directory-list")
                    .flex_1()
                    .overflow_y_scroll()
                    .px_2()
                    .children(directories.iter().enumerate().map(|(index, directory)| {
                        div()
                            .id(("directory", index))
                            .h(px(30.0))
                            .flex()
                            .items_center()
                            .gap_2()
                            .border_b_1()
                            .border_color(rgb(BORDER))
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
                                    .w(px(22.0))
                                    .h(px(22.0))
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .cursor_pointer()
                                    .rounded_md()
                                    .text_base()
                                    .text_color(rgb(MUTED))
                                    .hover(|style| style.bg(rgb(0xffedf0)).text_color(rgb(DANGER)))
                                    .on_click(cx.listener(move |panel, _, _, cx| {
                                        panel.remove_directory(index, cx)
                                    }))
                                    .child("×"),
                            )
                    }))
                    .when(directories.is_empty(), |element| {
                        element.child(
                            div()
                                .h(px(38.0))
                                .flex()
                                .items_center()
                                .text_xs()
                                .text_color(rgb(MUTED))
                                .child("尚未添加目录"),
                        )
                    }),
            )
            .child(
                div()
                    .h(px(24.0))
                    .flex()
                    .items_center()
                    .px_2()
                    .bg(rgb(SUBTLE))
                    .text_xs()
                    .text_color(rgb(MUTED))
                    .child(notice),
            )
            .child(
                div()
                    .id("quit")
                    .h(px(34.0))
                    .flex()
                    .items_center()
                    .justify_center()
                    .cursor_pointer()
                    .border_t_1()
                    .border_color(rgb(BORDER))
                    .text_xs()
                    .text_color(rgb(MUTED))
                    .hover(|style| style.bg(rgb(0xffedf0)).text_color(rgb(DANGER)))
                    .on_click(cx.listener(|_, _, _, cx| cx.quit()))
                    .child("退出动画管理服务"),
            )
    }
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
