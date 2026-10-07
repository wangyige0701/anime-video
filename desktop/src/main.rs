#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod assets;
mod cli;
mod config;
mod folder_picker;
mod notification;
mod panel;
mod position;
mod state;
mod tray;

use gpui::Application;

fn main() {
    match config::load_app_user_model_id() {
        Ok(application_id) => {
            notification::register_process_app_user_model_id(&application_id);
        }
        Err(error) => {
            eprintln!("读取应用标识失败: {error}");
        }
    }
    Application::new()
        .with_assets(assets::FileAssets)
        .run(|cx| {
            tray::install(cx);
        });
}
