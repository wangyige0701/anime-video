#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod assets;
mod cli;
mod config;
mod folder_picker;
mod instance;
mod logging;
mod notification;
mod panel;
mod position;
mod state;
mod tray;

use gpui::Application;

fn main() {
    logging::init();
    logging::install_panic_hook();
    logging::info(format!(
        "应用启动，exe={}, 当前目录={}",
        std::env::current_exe()
            .map(|path| path.display().to_string())
            .unwrap_or_else(|error| format!("读取失败: {error}")),
        std::env::current_dir()
            .map(|path| path.display().to_string())
            .unwrap_or_else(|error| format!("读取失败: {error}")),
    ));
    match config::load_app_user_model_id() {
        Ok(application_id) => {
            logging::info(format!("读取应用标识: {application_id}"));
            notification::register_process_app_user_model_id(&application_id);
        }
        Err(error) => {
            logging::error(format!("读取应用标识失败: {error}"));
        }
    }
    let application_id =
        config::load_app_user_model_id().unwrap_or_else(|_| "com.wangyige.anime-video".to_string());
    notification::register_app_user_model_metadata(&application_id);
    let _instance_guard = match instance::acquire(&application_id) {
        instance::InstanceState::Acquired(guard) => guard,
        instance::InstanceState::AlreadyRunning => {
            notification::show_already_running(&application_id);
            return;
        }
    };
    Application::new()
        .with_assets(assets::FileAssets)
        .run(|cx| {
            tray::install(cx);
        });
}
