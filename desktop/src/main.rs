#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod assets;
mod cli;
mod folder_picker;
mod panel;
mod position;
mod state;
mod tray;

use gpui::Application;

fn main() {
    Application::new()
        .with_assets(assets::FileAssets)
        .run(|cx| {
            tray::install(cx);
        });
}
