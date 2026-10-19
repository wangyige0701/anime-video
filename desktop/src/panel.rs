use crate::cli::{self, Service, ServiceAction, ServiceStatus, Snapshot};
use crate::folder_picker;
use crate::logging;
use crate::position;
use crate::state::CachedState;
use async_channel::Sender;
use gpui::{
    Animation, AnimationExt as _, AnyView, App, ClickEvent, Context, Render, SharedString,
    Subscription, Transformation, Window, WindowBackgroundAppearance, WindowBounds, WindowHandle,
    WindowKind, WindowOptions, div, ease_in_out, img, percentage, prelude::*, px, rgb, size, svg,
};
use std::{collections::HashMap, fs, path::PathBuf, time::Duration};
use tray_icon::Rect;

pub const PANEL_WIDTH: f32 = 232.0;
const HEADER_HEIGHT: f32 = 62.0;
const GLOBAL_CONTROL_HEIGHT: f32 = 73.0;
const STATUS_HEIGHT: f32 = 28.0;
const SERVICE_ROW_HEIGHT: f32 = 52.0;
const DIRECTORY_SECTION_HEIGHT: f32 = 40.0;
const DIRECTORY_TRIGGER_HEIGHT: f32 = 32.0;
const DIRECTORY_TRIGGER_INSET: f32 = 4.0;
const FOOTER_HEIGHT: f32 = 36.0;
const DIRECTORY_PANEL_MAX_HEIGHT: f32 = 246.0;
const DIRECTORY_PANEL_HIDE_DELAY: Duration = Duration::from_millis(260);
const PANEL_FOCUS_TRANSITION_DELAY: Duration = Duration::from_millis(80);
const PANEL_POINTER_LEAVE_DELAY: Duration = Duration::from_millis(180);
const DIRECTORY_FLIP_DURATION: Duration = Duration::from_millis(140);
const DIRECTORY_ROW_PITCH: f32 = 38.0;

const INK: u32 = 0x172033;
const MUTED: u32 = 0x748095;
const DISABLED: u32 = 0xaab2c0;
const BORDER: u32 = 0xe3e7ee;
const PANEL: u32 = 0xffffff;
const CANVAS: u32 = 0xf7f8fb;
const SUBTLE: u32 = 0xf1f3f7;
const PRIMARY: u32 = 0x3b5ccc;
const PRIMARY_SOFT: u32 = 0xeef2ff;
const DIRECTORY_TRIGGER_HOVER: u32 = 0xffffff;
const DIRECTORY_TRIGGER_ACTIVE: u32 = 0xf3f6fc;
const DIRECTORY_SECTION_BG: u32 = 0xf1f3f7;
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
    SortDirectories,
}

enum DirectoryCommand {
    Remove(usize),
    Sort(Vec<String>),
    PanelHover(bool),
    PanelDeactivated,
}

#[derive(Clone)]
struct DirectoryDrag {
    path: String,
}

struct DirectoryDragPreview {
    path: SharedString,
}

impl Render for DirectoryDragPreview {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
            .w(px(position::DIRECTORY_PANEL_WIDTH - 16.0))
            .h(px(34.0))
            .flex()
            .items_center()
            .gap_2()
            .px_1()
            .rounded_md()
            .bg(rgb(PANEL))
            .border_1()
            .border_color(rgb(PRIMARY))
            .shadow_md()
            .text_xs()
            .text_color(rgb(MUTED))
            .child(fluent_icon(ICON_FOLDER, MUTED))
            .child(shorten(&self.path, 34))
    }
}

struct DirectoryHoverCard {
    directories: Vec<String>,
    command_sender: Sender<DirectoryCommand>,
    drag_start_order: Option<Vec<String>>,
    active_drag_path: Option<String>,
    flip_offsets: HashMap<String, f32>,
    flip_generation: usize,
    sorting: bool,
    removing_directory: Option<String>,
    was_activated: bool,
    closing: bool,
    _activation_subscription: Subscription,
}

impl DirectoryHoverCard {
    fn new(
        directories: Vec<String>,
        command_sender: Sender<DirectoryCommand>,
        sorting: bool,
        removing_directory: Option<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let deactivated_sender = command_sender.clone();
        let activation_subscription =
            cx.observe_window_activation(window, move |panel, window, _| {
                if window.is_window_active() {
                    panel.was_activated = true;
                } else if panel.was_activated && !panel.closing {
                    let _ = deactivated_sender.try_send(DirectoryCommand::PanelDeactivated);
                }
            });
        Self {
            directories,
            command_sender,
            drag_start_order: None,
            active_drag_path: None,
            flip_offsets: HashMap::new(),
            flip_generation: 0,
            sorting,
            removing_directory,
            was_activated: false,
            closing: false,
            _activation_subscription: activation_subscription,
        }
    }

    fn replace_directories(
        &mut self,
        directories: Vec<String>,
        sorting: bool,
        removing_directory: Option<String>,
        cx: &mut Context<Self>,
    ) {
        if self.active_drag_path.is_some() {
            return;
        }
        self.directories = directories;
        self.sorting = sorting;
        self.removing_directory = removing_directory;
        self.drag_start_order = None;
        self.flip_offsets.clear();
        cx.notify();
    }

    fn begin_drag(&mut self, dragged_path: &str, cx: &mut Context<Self>) {
        if self.sorting || self.removing_directory.is_some() {
            return;
        }
        let mut changed = false;
        if self.drag_start_order.is_none() {
            self.drag_start_order = Some(self.directories.clone());
            changed = true;
        }
        if self.active_drag_path.as_deref() != Some(dragged_path) {
            self.active_drag_path = Some(dragged_path.to_string());
            changed = true;
        }
        if changed {
            cx.notify();
        }
    }

    fn move_dragged_directory(
        &mut self,
        dragged_path: &str,
        target_index: usize,
        cx: &mut Context<Self>,
    ) {
        let Some(source_index) = self
            .directories
            .iter()
            .position(|directory| directory == dragged_path)
        else {
            return;
        };
        if target_index >= self.directories.len() {
            return;
        }

        self.begin_drag(dragged_path, cx);
        if source_index == target_index {
            return;
        }
        let previous_order = self.directories.clone();
        let dragged_directory = self.directories.remove(source_index);
        self.directories.insert(target_index, dragged_directory);
        self.flip_offsets = self
            .directories
            .iter()
            .enumerate()
            .filter_map(|(new_index, directory)| {
                if directory == dragged_path {
                    return None;
                }
                let previous_index = previous_order
                    .iter()
                    .position(|candidate| candidate == directory)?;
                let offset = (previous_index as f32 - new_index as f32) * DIRECTORY_ROW_PITCH;
                (offset.abs() > f32::EPSILON).then(|| (directory.clone(), offset))
            })
            .collect();
        self.flip_generation = self.flip_generation.wrapping_add(1);
        cx.notify();
    }

    fn finish_drag(&mut self, cx: &mut Context<Self>) {
        let changed = self
            .drag_start_order
            .take()
            .is_some_and(|original| original != self.directories);
        self.active_drag_path = None;
        if changed {
            self.sorting = true;
            let _ = self
                .command_sender
                .try_send(DirectoryCommand::Sort(self.directories.clone()));
        }
        cx.notify();
    }

    fn cancel_drag(&mut self, cx: &mut Context<Self>) {
        if self.drag_start_order.is_none() && self.active_drag_path.is_none() {
            return;
        }
        if let Some(original) = self.drag_start_order.take() {
            self.directories = original;
        }
        self.active_drag_path = None;
        self.flip_offsets.clear();
        self.flip_generation = self.flip_generation.wrapping_add(1);
        let _ = self
            .command_sender
            .try_send(DirectoryCommand::PanelHover(false));
        cx.notify();
    }
}

impl Render for DirectoryHoverCard {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let directories = self.directories.clone();
        let hover_sender = self.command_sender.clone();
        let directory_operation_in_progress = self.sorting || self.removing_directory.is_some();
        div()
            .size_full()
            .flex()
            .flex_col()
            .id("directory-hover-card")
            .on_hover(move |hovering, _, _| {
                let _ = hover_sender.try_send(DirectoryCommand::PanelHover(*hovering));
            })
            .on_mouse_move({
                let hover_sender = self.command_sender.clone();
                move |_, _, _| {
                    let _ = hover_sender.try_send(DirectoryCommand::PanelHover(true));
                }
            })
            .on_drop(cx.listener(|panel, _: &DirectoryDrag, _, cx| {
                panel.finish_drag(cx);
            }))
            .on_mouse_up_out(
                gpui::MouseButton::Left,
                cx.listener(|panel, _, _, cx| panel.cancel_drag(cx)),
            )
            .overflow_y_scroll()
            .p_2()
            .gap_1()
            .rounded_lg()
            .bg(rgb(PANEL))
            .border_1()
            .border_color(rgb(BORDER))
            .shadow_lg()
            .text_color(rgb(INK))
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .px_1()
                    .pb_1()
                    .text_xs()
                    .font_weight(gpui::FontWeight::SEMIBOLD)
                    .child("视频检索目录")
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_1()
                            .text_color(rgb(MUTED))
                            .when(self.sorting, |element| {
                                element.child(loading_indicator(PRIMARY)).child("保存中")
                            })
                            .when(!self.sorting, |element| element.child("拖动排序")),
                    ),
            )
            .children(directories.iter().enumerate().map(|(index, directory)| {
                let label = shorten(directory, 34);
                let drag_value = DirectoryDrag {
                    path: directory.clone(),
                };
                let drag_panel = cx.entity();
                let remove_sender = self.command_sender.clone();
                let flip_offset = self.flip_offsets.get(directory).copied().unwrap_or(0.0);
                let flip_id = (
                    SharedString::from(format!("目录换位:{directory}")),
                    self.flip_generation,
                );
                let is_dragging = self.active_drag_path.as_deref() == Some(directory.as_str());
                let is_removing = self.removing_directory.as_deref() == Some(directory.as_str());
                let row_content = div()
                    .size_full()
                    .flex()
                    .items_center()
                    .gap_2()
                    .px_1()
                    .rounded_md()
                    .when(index + 1 < directories.len(), |element| {
                        element.border_b_1().border_color(rgb(BORDER))
                    })
                    .when(is_dragging, |element| element.opacity(0.0))
                    .child(
                        div()
                            .id(SharedString::from(format!("目录拖拽:{directory}")))
                            .flex_1()
                            .h_full()
                            .flex()
                            .items_center()
                            .gap_2()
                            .when(!directory_operation_in_progress, |element| {
                                element
                                    .cursor_move()
                                    .on_drag(drag_value, move |drag, _, _, cx| {
                                        let dragged_path = drag.path.clone();
                                        let _ = drag_panel.update(cx, |panel, cx| {
                                            panel.begin_drag(&dragged_path, cx);
                                        });
                                        let path = SharedString::from(drag.path.clone());
                                        cx.new(|_| DirectoryDragPreview { path })
                                    })
                            })
                            .when(directory_operation_in_progress, |element| {
                                element.cursor_default()
                            })
                            .child(fluent_icon(ICON_FOLDER, MUTED))
                            .child(
                                div()
                                    .id(("directory-detail-path", index))
                                    .flex_1()
                                    .text_xs()
                                    .text_color(rgb(MUTED))
                                    .tooltip(tooltip(directory.to_string()))
                                    .child(label),
                            ),
                    )
                    .child(
                        div()
                            .id(("directory-detail-remove", index))
                            .size_7()
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded_md()
                            .tooltip(tooltip("删除此视频目录"))
                            .when(!directory_operation_in_progress, |element| {
                                element
                                    .cursor_pointer()
                                    .hover(|style| style.bg(rgb(0xffedf0)).text_color(rgb(DANGER)))
                                    .on_click(move |_, _, _| {
                                        let _ =
                                            remove_sender.try_send(DirectoryCommand::Remove(index));
                                    })
                            })
                            .when(is_removing, |element| {
                                element.child(loading_indicator(DANGER))
                            })
                            .when(!is_removing, |element| {
                                element.child(fluent_icon(
                                    ICON_CLOSE,
                                    if directory_operation_in_progress {
                                        DISABLED
                                    } else {
                                        DANGER
                                    },
                                ))
                            }),
                    )
                    .with_animation(
                        flip_id,
                        Animation::new(DIRECTORY_FLIP_DURATION).with_easing(ease_in_out),
                        move |element, delta| {
                            element.relative().top(px(flip_offset * (1.0 - delta)))
                        },
                    );

                div()
                    .id(SharedString::from(format!("目录行:{directory}")))
                    .h(px(34.0))
                    .flex_shrink_0()
                    .on_drag_move::<DirectoryDrag>(cx.listener(
                        move |panel, event: &gpui::DragMoveEvent<DirectoryDrag>, _, cx| {
                            if event.bounds.contains(&event.event.position) {
                                let dragged_path = event.drag(cx).path.clone();
                                let source_index = panel
                                    .directories
                                    .iter()
                                    .position(|directory| directory == &dragged_path);
                                let target_middle =
                                    event.bounds.top() + event.bounds.size.height / 2.0;
                                let should_move = source_index.is_some_and(|source_index| {
                                    (source_index < index
                                        && event.event.position.y >= target_middle)
                                        || (source_index > index
                                            && event.event.position.y <= target_middle)
                                });
                                if should_move {
                                    panel.move_dragged_directory(&dragged_path, index, cx);
                                }
                            }
                        },
                    ))
                    .child(row_content)
            }))
    }
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
    main_window: WindowHandle<TrayPanel>,
    was_activated: bool,
    path_prompt_open: bool,
    should_reopen_directory_panel: bool,
    pointer_entered_panel_group: bool,
    panel_group_generation: u64,
    directory_trigger_hovered: bool,
    directory_close_generation: u64,
    directory_window: Option<WindowHandle<DirectoryHoverCard>>,
    _activation_subscription: Subscription,
    _bounds_subscription: Subscription,
    directory_command_sender: Sender<DirectoryCommand>,
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
    pub fn close(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.close_directory_panel(cx);
        window.remove_window();
    }

    pub fn new(
        cache: CachedState,
        tray_rect: Rect,
        panel_height: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let main_window = window
            .window_handle()
            .downcast::<TrayPanel>()
            .expect("托盘面板窗口类型不匹配");
        let activation_subscription = cx.observe_window_activation(window, |panel, window, cx| {
            if window.is_window_active() {
                panel.was_activated = true;
            } else if panel.was_activated && !panel.path_prompt_open {
                panel.schedule_focus_loss_check(cx);
            }
        });
        let bounds_subscription = cx.observe_window_bounds(window, |panel, window, _| {
            position::bring_to_front_and_align(window, panel.tray_rect);
        });
        let (directory_command_sender, directory_command_receiver) = async_channel::unbounded();
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
            main_window,
            was_activated: false,
            path_prompt_open: false,
            should_reopen_directory_panel: false,
            pointer_entered_panel_group: false,
            panel_group_generation: 0,
            directory_trigger_hovered: false,
            directory_close_generation: 0,
            directory_window: None,
            _activation_subscription: activation_subscription,
            _bounds_subscription: bounds_subscription,
            directory_command_sender,
        };
        let panel_entity = cx.entity();
        cx.spawn(async move |this, cx| {
            while let Ok(command) = directory_command_receiver.recv().await {
                let _ = this.update(cx, |panel, cx| panel.handle_directory_command(command, cx));
            }
        })
        .detach();
        cx.defer(move |cx| {
            panel_entity.update(cx, |panel, cx| {
                panel.was_activated = true;
                panel.refresh(cx);
            })
        });
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
                panel.apply_snapshot(result, "状态已刷新", cx);
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
                panel.apply_snapshot(result, "服务操作完成", cx);
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

    fn handle_directory_command(&mut self, command: DirectoryCommand, cx: &mut Context<Self>) {
        match command {
            DirectoryCommand::Remove(index) => {
                self.remove_directory(index, cx);
            }
            DirectoryCommand::Sort(directories) => {
                self.sort_directories(directories, cx);
            }
            DirectoryCommand::PanelHover(hovering) => {
                self.directory_close_generation += 1;
                self.set_panel_group_hovered(hovering, cx);
                if !hovering {
                    self.schedule_directory_panel_close(cx);
                }
            }
            DirectoryCommand::PanelDeactivated => {
                self.schedule_focus_loss_check(cx);
            }
        }
    }

    fn set_directory_trigger_hovered(&mut self, hovering: bool, cx: &mut Context<Self>) {
        self.directory_trigger_hovered = hovering;
        self.directory_close_generation += 1;
        self.set_panel_group_hovered(hovering, cx);
        if hovering {
            if self.directory_window.is_none() {
                logging::info("鼠标进入目录总览，准备打开目录详情面板");
                let main_window = self.main_window;
                cx.defer(move |cx| {
                    let _ = main_window.update(cx, |panel, window, cx| {
                        panel.open_directory_panel(window, cx);
                    });
                });
            }
        } else {
            self.schedule_directory_panel_close(cx);
        }
    }

    fn open_directory_panel(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.directory_window.is_some() {
            return;
        }

        let panel_height = directory_panel_height(self.directories.len());
        let trigger_y = HEADER_HEIGHT
            + GLOBAL_CONTROL_HEIGHT
            + STATUS_HEIGHT
            + SERVICE_ROW_HEIGHT * 2.0
            + DIRECTORY_TRIGGER_INSET;
        let placement = position::beside_directory_trigger(
            window,
            trigger_y,
            DIRECTORY_TRIGGER_HEIGHT,
            panel_height,
            cx,
        );
        logging::info(format!(
            "打开目录详情面板，窗口位置: {:?}",
            placement.bounds
        ));
        let directories = self.directories.clone();
        let (sorting, removing_directory) = self.directory_operation_state();
        let command_sender = self.directory_command_sender.clone();
        let options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(placement.bounds)),
            titlebar: None,
            focus: false,
            kind: WindowKind::PopUp,
            is_movable: false,
            is_resizable: false,
            is_minimizable: false,
            display_id: placement.display_id,
            window_background: WindowBackgroundAppearance::Transparent,
            ..Default::default()
        };

        match cx.open_window(options, |window, cx| {
            cx.new(|cx| {
                DirectoryHoverCard::new(
                    directories,
                    command_sender,
                    sorting,
                    removing_directory,
                    window,
                    cx,
                )
            })
        }) {
            Ok(directory_window) => {
                let _ = directory_window.update(cx, |_, window, _| {
                    position::set_topmost_without_activation(window);
                });
                self.directory_window = Some(directory_window);
            }
            Err(error) => {
                logging::error(format!("打开目录详情面板失败: {error:?}"));
                self.notice = compact_error(&error.to_string());
                cx.notify();
            }
        }
    }

    fn schedule_directory_panel_close(&mut self, cx: &mut Context<Self>) {
        let generation = self.directory_close_generation;
        cx.spawn(async move |this, cx| {
            cx.background_executor()
                .timer(DIRECTORY_PANEL_HIDE_DELAY)
                .await;
            let _ = this.update(cx, |panel, cx| {
                let directory_state = panel.directory_window.and_then(|directory_window| {
                    directory_window
                        .update(cx, |directory_panel, window, _| {
                            (
                                window.is_window_hovered(),
                                directory_panel.active_drag_path.is_some(),
                            )
                        })
                        .ok()
                });
                let (directory_hovered, dragging) = directory_state.unwrap_or((false, false));
                if panel.directory_close_generation == generation
                    && !panel.directory_trigger_hovered
                    && !directory_hovered
                    && !dragging
                {
                    panel.close_directory_panel(cx);
                }
            });
        })
        .detach();
    }

    fn close_directory_panel(&mut self, cx: &mut Context<Self>) {
        if let Some(directory_window) = self.directory_window.take() {
            let _ = directory_window.update(cx, |panel, window, _| {
                panel.closing = true;
                window.remove_window();
            });
        }
    }

    fn sync_directory_panel(&self, cx: &mut Context<Self>) {
        let Some(directory_window) = self.directory_window else {
            return;
        };
        let directories = self.directories.clone();
        let (sorting, removing_directory) = self.directory_operation_state();
        let panel_height = directory_panel_height(directories.len());
        let main_window = self.main_window;
        let _ = directory_window.update(cx, move |panel, window, cx| {
            panel.replace_directories(directories, sorting, removing_directory, cx);
            window.resize(size(px(position::DIRECTORY_PANEL_WIDTH), px(panel_height)));
        });
        cx.defer(move |cx| {
            let placement = main_window
                .update(cx, |_, main_window, cx| {
                    position::beside_directory_trigger(
                        main_window,
                        HEADER_HEIGHT
                            + GLOBAL_CONTROL_HEIGHT
                            + STATUS_HEIGHT
                            + SERVICE_ROW_HEIGHT * 2.0
                            + DIRECTORY_TRIGGER_INSET,
                        DIRECTORY_TRIGGER_HEIGHT,
                        panel_height,
                        cx,
                    )
                })
                .ok();
            if let Some(placement) = placement {
                let _ = directory_window.update(cx, |_, window, _| {
                    position::move_window_to(window, placement.bounds.origin);
                });
            }
        });
    }

    fn directory_operation_state(&self) -> (bool, Option<String>) {
        match self.pending_operation {
            Some(PendingOperation::SortDirectories) => (true, None),
            Some(PendingOperation::RemoveDirectory(index)) => {
                (false, self.directories.get(index).cloned())
            }
            _ => (false, None),
        }
    }

    fn reopen_directory_panel_after_prompt(&mut self, cx: &mut Context<Self>) {
        if !self.should_reopen_directory_panel {
            return;
        }
        self.should_reopen_directory_panel = false;
        let main_window = self.main_window;
        cx.defer(move |cx| {
            let _ = main_window.update(cx, |panel, window, cx| {
                panel.open_directory_panel(window, cx);
            });
        });
    }

    fn schedule_focus_loss_check(&self, cx: &mut Context<Self>) {
        let main_window = self.main_window;
        cx.spawn(async move |_, cx| {
            cx.background_executor()
                .timer(PANEL_FOCUS_TRANSITION_DELAY)
                .await;
            let _ = cx.update(|cx| {
                let Some((directory_window, main_active, path_prompt_open)) = main_window
                    .update(cx, |panel, window, _| {
                        (
                            panel.directory_window,
                            window.is_window_active(),
                            panel.path_prompt_open,
                        )
                    })
                    .ok()
                else {
                    return;
                };
                if path_prompt_open {
                    return;
                }
                let directory_active = directory_window
                    .and_then(|directory_window| {
                        directory_window
                            .update(cx, |_, window, _| window.is_window_active())
                            .ok()
                    })
                    .unwrap_or(false);
                if !main_active && !directory_active {
                    let _ = main_window.update(cx, |panel, window, cx| panel.close(window, cx));
                }
            });
        })
        .detach();
    }

    fn set_panel_group_hovered(&mut self, hovering: bool, cx: &mut Context<Self>) {
        self.panel_group_generation = self.panel_group_generation.wrapping_add(1);
        if hovering {
            self.pointer_entered_panel_group = true;
        } else if self.pointer_entered_panel_group {
            self.schedule_pointer_leave_check(cx);
        }
    }

    fn schedule_pointer_leave_check(&self, cx: &mut Context<Self>) {
        let main_window = self.main_window;
        let generation = self.panel_group_generation;
        cx.spawn(async move |_, cx| {
            cx.background_executor()
                .timer(PANEL_POINTER_LEAVE_DELAY)
                .await;
            let _ = cx.update(|cx| {
                let Some((directory_window, current_generation, path_prompt_open, main_hovered)) =
                    main_window
                        .update(cx, |panel, window, _| {
                            (
                                panel.directory_window,
                                panel.panel_group_generation,
                                panel.path_prompt_open,
                                window.is_window_hovered(),
                            )
                        })
                        .ok()
                else {
                    return;
                };
                if path_prompt_open || current_generation != generation || main_hovered {
                    return;
                }
                let (directory_hovered, directory_dragging) = directory_window
                    .and_then(|directory_window| {
                        directory_window
                            .update(cx, |panel, window, _| {
                                (window.is_window_hovered(), panel.active_drag_path.is_some())
                            })
                            .ok()
                    })
                    .unwrap_or((false, false));
                if !directory_hovered && !directory_dragging {
                    let _ = main_window.update(cx, |panel, window, cx| panel.close(window, cx));
                }
            });
        })
        .detach();
    }

    fn choose_directories(&mut self, _: &ClickEvent, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        // 系统选择器使用独立 STA 消息循环；选择期间隐藏面板，避免置顶浮层遮挡对话框。
        self.should_reopen_directory_panel = self.directory_window.is_some();
        self.close_directory_panel(cx);
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
                        panel.reopen_directory_panel_after_prompt(cx);
                        cx.notify();
                    });
                    return;
                }
                Err(error) => {
                    let _ = this.update(cx, |panel, cx| {
                        panel.busy = false;
                        panel.pending_operation = None;
                        panel.notice = compact_error(&error);
                        panel.reopen_directory_panel_after_prompt(cx);
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
                panel.apply_snapshot(result, "目录已更新", cx);
                panel.reopen_directory_panel_after_prompt(cx);
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
        self.sync_directory_panel(cx);
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
                panel.apply_snapshot(result, "目录已删除", cx);
                cx.notify();
            });
        })
        .detach();
    }

    fn sort_directories(&mut self, directories: Vec<String>, cx: &mut Context<Self>) {
        if self.busy || directories == self.directories {
            return;
        }

        self.busy = true;
        self.pending_operation = Some(PendingOperation::SortDirectories);
        self.notice = "正在保存目录顺序...".to_string();
        self.directories = directories.clone();
        self.sync_directory_panel(cx);
        cx.notify();

        let cache = self.cache.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    cli::sort_directories(&directories)?;
                    cli::load_snapshot()
                })
                .await;
            if let Ok(snapshot) = &result {
                cache.update_snapshot(snapshot.clone());
            }
            let _ = this.update(cx, |panel, cx| {
                panel.busy = false;
                panel.pending_operation = None;
                if result.is_err() {
                    panel.directories = panel.cache.read().snapshot.directories;
                }
                panel.apply_snapshot(result, "目录顺序已更新", cx);
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

    fn apply_snapshot(
        &mut self,
        result: Result<Snapshot, String>,
        success_message: &str,
        cx: &mut Context<Self>,
    ) {
        match result {
            Ok(snapshot) => {
                self.cache.update_snapshot(snapshot.clone());
                self.api = snapshot.api;
                self.web = snapshot.web;
                self.directories = snapshot.directories;
                self.sync_directory_panel(cx);
                self.notice = success_message.to_string();
            }
            Err(error) => {
                self.sync_directory_panel(cx);
                self.notice = compact_error(&error);
            }
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
        let directory_count = self.directories.len();
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
            .on_hover(cx.listener(|panel, hovering: &bool, _, cx| {
                panel.set_panel_group_hovered(*hovering, cx);
            }))
            .on_mouse_move(cx.listener(|panel, _: &gpui::MouseMoveEvent, _, cx| {
                panel.set_panel_group_hovered(true, cx);
            }))
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
                    .h(px(DIRECTORY_SECTION_HEIGHT))
                    .flex()
                    .items_center()
                    .bg(rgb(DIRECTORY_SECTION_BG))
                    .border_t_1()
                    .border_b_1()
                    .border_color(rgb(BORDER))
                    .child(
                        div()
                            .id("directory-details-trigger")
                            .h(px(DIRECTORY_TRIGGER_HEIGHT))
                            .mx_1()
                            .flex_1()
                            .px_2()
                            .flex()
                            .items_center()
                            .justify_between()
                            .cursor_pointer()
                            .hover(|style| style.bg(rgb(DIRECTORY_TRIGGER_HOVER)))
                            .when(self.directory_trigger_hovered, |element| {
                                element.bg(rgb(DIRECTORY_TRIGGER_ACTIVE))
                            })
                            .on_mouse_move(cx.listener(|panel, _: &gpui::MouseMoveEvent, _, cx| {
                                if !panel.directory_trigger_hovered
                                    || panel.directory_window.is_none()
                                {
                                    panel.set_directory_trigger_hovered(true, cx);
                                }
                            }))
                            .on_hover(cx.listener(|panel, hovering: &bool, _, cx| {
                                panel.set_directory_trigger_hovered(*hovering, cx);
                            }))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap_2()
                                    .child(
                                        div()
                                            .w(px(3.0))
                                            .h(px(18.0))
                                            .rounded_full()
                                            .bg(rgb(PRIMARY)),
                                    )
                                    .child(
                                        div()
                                            .size_5()
                                            .flex()
                                            .items_center()
                                            .justify_center()
                                            .child(fluent_icon(ICON_FOLDER, PRIMARY)),
                                    )
                                    .child(
                                        div()
                                            .text_xs()
                                            .font_weight(gpui::FontWeight::SEMIBOLD)
                                            .text_color(rgb(INK))
                                            .child("视频目录"),
                                    )
                                    .child(
                                        div()
                                            .ml_1()
                                            .text_xs()
                                            .text_color(rgb(MUTED))
                                            .child(format!("{} 个", directory_count)),
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
                    ),
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
                    .child(div().min_w(px(0.0)).flex_1().truncate().child(notice))
                    .when(show_web_entry, |element| {
                        element.child(
                            div()
                                .id("open-web")
                                .w(px(62.0))
                                .h(px(26.0))
                                .flex()
                                .flex_shrink_0()
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
                            .w(px(58.0))
                            .h(px(26.0))
                            .flex()
                            .flex_shrink_0()
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

pub fn panel_height_for_directory_count(_directory_count: usize) -> f32 {
    HEADER_HEIGHT
        + GLOBAL_CONTROL_HEIGHT
        + STATUS_HEIGHT
        + SERVICE_ROW_HEIGHT * 2.0
        + DIRECTORY_SECTION_HEIGHT
        + FOOTER_HEIGHT
}

fn directory_panel_height(directory_count: usize) -> f32 {
    (36.0 + directory_count as f32 * 38.0).clamp(44.0, DIRECTORY_PANEL_MAX_HEIGHT)
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
    fn panel_height_is_fixed_for_directory_header() {
        let height = panel_height_for_directory_count(0);
        assert_eq!(height, 343.0);
        assert_eq!(panel_height_for_directory_count(1), height);
        assert_eq!(panel_height_for_directory_count(2), height);
        assert_eq!(panel_height_for_directory_count(5), height);
        assert_eq!(panel_height_for_directory_count(8), height);
    }
}
