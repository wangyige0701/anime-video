fn main() {
    if std::env::var_os("CARGO_CFG_WINDOWS").is_none() {
        return;
    }

    let mut resource = winresource::WindowsResource::new();
    resource.set_icon("assets/icon.ico");
    resource.set("FileDescription", "动画管理服务");
    resource.set("ProductName", "动画管理服务");
    resource.set("InternalName", "动画管理服务");
    resource.set("OriginalFilename", "anime-video.exe");
    resource
        .compile()
        .expect("failed to embed Windows application icon");
}
