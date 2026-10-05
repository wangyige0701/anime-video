mod cli;
mod panel;
mod position;
mod tray;

use gpui::Application;

fn main() {
    Application::new().run(|cx| {
        tray::install(cx);
    });
}
