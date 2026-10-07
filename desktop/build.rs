fn main() {
    if std::env::var_os("CARGO_CFG_WINDOWS").is_none() {
        return;
    }

    let mut resource = winresource::WindowsResource::new();
    resource.set_icon("assets/icon.ico");
    resource
        .compile()
        .expect("failed to embed Windows application icon");
}
