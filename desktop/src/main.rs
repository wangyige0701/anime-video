use gpui::{Application, Window, WindowOptions, div, prelude::*};

struct AnimeVideo;

impl Render for AnimeVideo {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        div().child("Anime Video")
    }
}

fn main() {
    Application::new().run(|cx| {
        if let Err(error) = cx.open_window(WindowOptions::default(), |_, cx| cx.new(|_| AnimeVideo))
        {
            eprintln!("无法创建窗口: {:?}", error);
        }
    });
}
