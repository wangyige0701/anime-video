use crate::cli::{self, Service, ServiceAction, ServiceStatus, Snapshot};
use gpui::{ClickEvent, Context, PathPromptOptions, Render, Window, div, prelude::*, rgb};
use std::fs;

const INK: u32 = 0x1f2937;
const MUTED: u32 = 0x6b7280;
const BORDER: u32 = 0xe5e7eb;
const PANEL: u32 = 0xffffff;
const CANVAS: u32 = 0xf4f7fb;
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
}

impl TrayPanel {
    pub fn new(cx: &mut Context<Self>) -> Self {
        let panel = Self {
            api: ServiceStatus::stopped(Service::Api),
            web: ServiceStatus::stopped(Service::Web),
            directories: Vec::new(),
            busy: false,
            notice: "正在读取服务状态...".to_string(),
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
        self.notice = "正在刷新服务状态...".to_string();
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
        self.notice = "正在选择视频目录...".to_string();
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
                        panel.notice = format!("目录选择失败: {error}");
                        cx.notify();
                    });
                    return;
                }
                Err(error) => {
                    let _ = this.update(cx, |panel, cx| {
                        panel.busy = false;
                        panel.notice = format!("目录选择被中断: {error}");
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
                panel.apply_snapshot(result, "视频目录已更新");
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
        self.notice = "正在删除视频目录...".to_string();
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
                panel.apply_snapshot(result, "视频目录已删除");
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
                self.notice = format!("已打开{}日志目录", service.label());
            }
            Err(error) => self.notice = format!("无法打开日志目录: {error}"),
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
            Err(error) => self.notice = error,
        }
    }

    fn status_for(&self, service: Service) -> &ServiceStatus {
        match service {
            Service::Api => &self.api,
            Service::Web => &self.web,
        }
    }

    fn service_card(&self, service: Service, cx: &mut Context<Self>) -> impl IntoElement {
        let status = self.status_for(service);
        let (color, label) = status_presentation(&status.state);
        let details = if status.state == "running" {
            format!(
                "PID {} · {}",
                status.pid.map_or("-".to_string(), |pid| pid.to_string()),
                format_duration(status.uptime_ms)
            )
        } else if let Some(error) = &status.last_error {
            shorten(error, 56)
        } else {
            "等待服务启动".to_string()
        };
        let service_key = service.key();

        div()
            .id(("service-card", service_key))
            .flex()
            .flex_col()
            .gap_3()
            .p_4()
            .bg(rgb(PANEL))
            .border_1()
            .border_color(rgb(BORDER))
            .rounded_lg()
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_2()
                            .child(div().size_2().rounded_full().bg(rgb(color)))
                            .child(
                                div()
                                    .text_sm()
                                    .font_weight(gpui::FontWeight::SEMIBOLD)
                                    .text_color(rgb(INK))
                                    .child(service.label()),
                            ),
                    )
                    .child(
                        div()
                            .px_2()
                            .py_1()
                            .rounded_full()
                            .bg(rgb(tint(color)))
                            .text_xs()
                            .text_color(rgb(color))
                            .child(label),
                    ),
            )
            .child(div().text_xs().text_color(rgb(MUTED)).child(details))
            .child(
                div()
                    .flex()
                    .gap_2()
                    .child(
                        div()
                            .id(("start", service_key))
                            .flex_1()
                            .cursor_pointer()
                            .rounded_md()
                            .bg(rgb(0xeff6ff))
                            .px_2()
                            .py_2()
                            .text_sm()
                            .text_color(rgb(PRIMARY))
                            .text_center()
                            .hover(|style| style.bg(rgb(0xdbeafe)))
                            .on_click(cx.listener(move |panel, _, _, cx| {
                                panel.run_action(ServiceAction::Start, Some(service), cx)
                            }))
                            .child("▶ 启动"),
                    )
                    .child(
                        div()
                            .id(("stop", service_key))
                            .flex_1()
                            .cursor_pointer()
                            .rounded_md()
                            .bg(rgb(0xfff1f2))
                            .px_2()
                            .py_2()
                            .text_sm()
                            .text_color(rgb(DANGER))
                            .text_center()
                            .hover(|style| style.bg(rgb(0xffe4e6)))
                            .on_click(cx.listener(move |panel, _, _, cx| {
                                panel.run_action(ServiceAction::Stop, Some(service), cx)
                            }))
                            .child("■ 停止"),
                    )
                    .child(
                        div()
                            .id(("restart", service_key))
                            .flex_1()
                            .cursor_pointer()
                            .rounded_md()
                            .bg(rgb(0xfff7ed))
                            .px_2()
                            .py_2()
                            .text_sm()
                            .text_color(rgb(WARNING))
                            .text_center()
                            .hover(|style| style.bg(rgb(0xffedd5)))
                            .on_click(cx.listener(move |panel, _, _, cx| {
                                panel.run_action(ServiceAction::Restart, Some(service), cx)
                            }))
                            .child("↻ 重启"),
                    )
                    .child(
                        div()
                            .id(("logs", service_key))
                            .cursor_pointer()
                            .rounded_md()
                            .bg(rgb(0xf3f4f6))
                            .px_2()
                            .py_2()
                            .text_sm()
                            .text_color(rgb(MUTED))
                            .hover(|style| style.bg(rgb(0xe5e7eb)))
                            .on_click(
                                cx.listener(move |panel, _, _, cx| panel.reveal_logs(service, cx)),
                            )
                            .child("查看日志"),
                    ),
            )
    }
}

impl Render for TrayPanel {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let directories = self.directories.clone();
        let busy_label = if self.busy {
            "处理中..."
        } else {
            self.notice.as_str()
        };

        div()
            .id("panel-scroll")
            .size_full()
            .overflow_y_scroll()
            .bg(rgb(CANVAS))
            .p_4()
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_4()
                    .p_5()
                    .bg(rgb(PANEL))
                    .border_1()
                    .border_color(rgb(BORDER))
                    .rounded_xl()
                    .shadow_lg()
                    .child(
                        div()
                            .flex()
                            .items_start()
                            .justify_between()
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .gap_1()
                                    .child(
                                        div()
                                            .text_xl()
                                            .font_weight(gpui::FontWeight::SEMIBOLD)
                                            .text_color(rgb(INK))
                                            .child("Anime Video"),
                                    )
                                    .child(
                                        div()
                                            .text_sm()
                                            .text_color(rgb(MUTED))
                                            .child("本地媒体服务控制中心"),
                                    ),
                            )
                            .child(
                                div()
                                    .id("refresh")
                                    .cursor_pointer()
                                    .rounded_md()
                                    .bg(rgb(0xf3f4f6))
                                    .px_3()
                                    .py_2()
                                    .text_sm()
                                    .text_color(rgb(MUTED))
                                    .hover(|style| style.bg(rgb(0xe5e7eb)))
                                    .on_click(cx.listener(|panel, _, _, cx| panel.refresh(cx)))
                                    .child("↻ 刷新"),
                            ),
                    )
                    .child(div().h_px().bg(rgb(BORDER)))
                    .child(
                        div()
                            .flex()
                            .gap_2()
                            .child(
                                div()
                                    .id("all-start")
                                    .flex_1()
                                    .cursor_pointer()
                                    .rounded_md()
                                    .bg(rgb(PRIMARY))
                                    .px_3()
                                    .py_2()
                                    .text_sm()
                                    .text_color(rgb(0xffffff))
                                    .text_center()
                                    .hover(|style| style.bg(rgb(0x1d4ed8)))
                                    .on_click(cx.listener(|panel, _, _, cx| {
                                        panel.run_action(ServiceAction::Start, None, cx)
                                    }))
                                    .child("▶ 启动全部"),
                            )
                            .child(
                                div()
                                    .id("all-stop")
                                    .flex_1()
                                    .cursor_pointer()
                                    .rounded_md()
                                    .bg(rgb(0xfff1f2))
                                    .px_3()
                                    .py_2()
                                    .text_sm()
                                    .text_color(rgb(DANGER))
                                    .text_center()
                                    .hover(|style| style.bg(rgb(0xffe4e6)))
                                    .on_click(cx.listener(|panel, _, _, cx| {
                                        panel.run_action(ServiceAction::Stop, None, cx)
                                    }))
                                    .child("■ 停止全部"),
                            )
                            .child(
                                div()
                                    .id("all-restart")
                                    .flex_1()
                                    .cursor_pointer()
                                    .rounded_md()
                                    .bg(rgb(0xfff7ed))
                                    .px_3()
                                    .py_2()
                                    .text_sm()
                                    .text_color(rgb(WARNING))
                                    .text_center()
                                    .hover(|style| style.bg(rgb(0xffedd5)))
                                    .on_click(cx.listener(|panel, _, _, cx| {
                                        panel.run_action(ServiceAction::Restart, None, cx)
                                    }))
                                    .child("↻ 重启全部"),
                            ),
                    )
                    .child(
                        div()
                            .text_xs()
                            .text_color(rgb(MUTED))
                            .child(busy_label.to_string()),
                    )
                    .child(self.service_card(Service::Web, cx))
                    .child(self.service_card(Service::Api, cx))
                    .child(div().h_px().bg(rgb(BORDER)))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .gap_1()
                                    .child(
                                        div()
                                            .text_sm()
                                            .font_weight(gpui::FontWeight::SEMIBOLD)
                                            .text_color(rgb(INK))
                                            .child("视频检索目录"),
                                    )
                                    .child(
                                        div()
                                            .text_xs()
                                            .text_color(rgb(MUTED))
                                            .child("目录变更后会自动刷新媒体索引"),
                                    ),
                            )
                            .child(
                                div()
                                    .id("add-directory")
                                    .cursor_pointer()
                                    .rounded_md()
                                    .bg(rgb(0xeff6ff))
                                    .px_3()
                                    .py_2()
                                    .text_sm()
                                    .text_color(rgb(PRIMARY))
                                    .hover(|style| style.bg(rgb(0xdbeafe)))
                                    .on_click(cx.listener(Self::choose_directories))
                                    .child("+ 添加"),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap_2()
                            .children(directories.iter().enumerate().map(|(index, directory)| {
                                let directory = shorten(directory, 52);
                                div()
                                    .id(("directory", index))
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .gap_3()
                                    .rounded_md()
                                    .bg(rgb(0xf9fafb))
                                    .border_1()
                                    .border_color(rgb(BORDER))
                                    .px_3()
                                    .py_2()
                                    .child(
                                        div()
                                            .flex_1()
                                            .text_sm()
                                            .text_color(rgb(INK))
                                            .child(directory),
                                    )
                                    .child(
                                        div()
                                            .id(("remove-directory", index))
                                            .cursor_pointer()
                                            .text_sm()
                                            .text_color(rgb(DANGER))
                                            .hover(|style| style.text_color(rgb(0x991b1b)))
                                            .on_click(cx.listener(move |panel, _, _, cx| {
                                                panel.remove_directory(index, cx)
                                            }))
                                            .child("删除"),
                                    )
                            }))
                            .when(directories.is_empty(), |element| {
                                element.child(
                                    div()
                                        .rounded_md()
                                        .bg(rgb(0xf9fafb))
                                        .px_3()
                                        .py_3()
                                        .text_sm()
                                        .text_color(rgb(MUTED))
                                        .child("尚未配置视频检索目录"),
                                )
                            }),
                    )
                    .child(div().h_px().bg(rgb(BORDER)))
                    .child(
                        div()
                            .id("quit")
                            .cursor_pointer()
                            .rounded_md()
                            .bg(rgb(0xfff1f2))
                            .px_3()
                            .py_2()
                            .text_sm()
                            .text_color(rgb(DANGER))
                            .text_center()
                            .hover(|style| style.bg(rgb(0xffe4e6)))
                            .on_click(cx.listener(|_, _, _, cx| cx.quit()))
                            .child("退出 Anime Video"),
                    ),
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

fn tint(color: u32) -> u32 {
    match color {
        SUCCESS => 0xf0fdf4,
        WARNING => 0xfff7ed,
        DANGER => 0xfff1f2,
        _ => 0xf3f4f6,
    }
}

fn format_duration(milliseconds: u64) -> String {
    let seconds = milliseconds / 1000;
    format!(
        "已运行 {:02}:{:02}:{:02}",
        seconds / 3600,
        seconds / 60 % 60,
        seconds % 60
    )
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
