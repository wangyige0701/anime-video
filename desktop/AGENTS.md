# Desktop 桌面托盘开发约定

## 适用范围

本文件适用于 `desktop/` 下的 Rust 桌面端实现。仓库根 `AGENTS.md` 的跨项目、文档同步和格式要求仍然有效；涉及 server CLI 命令、输出结构或运行入口时，还必须同时遵循 `server/AGENTS.md` 并更新 `server/cli.md`。

桌面端是独立 Cargo 项目，不属于 pnpm workspace。它只负责托盘交互、状态展示和调用 server CLI，不直接实现服务生命周期管理，也不得直接修改 manager 状态或 `.video.json`。

## 当前结构

```text
desktop/
├── assets/
│   ├── icon.png           # 面板标题图标
│   ├── icon_64.png        # Windows 托盘图标
│   └── loading.svg        # 操作及刷新加载动画
├── src/
│   ├── main.rs            # GPUI 应用入口和资源注册
│   ├── tray.rs            # 托盘图标、隐藏宿主窗口、状态预取和浮层生命周期
│   ├── panel.rs           # 浮层 UI、交互状态及服务/目录操作
│   ├── position.rs        # 多显示器 DPI、托盘定位、置顶和显隐 Win32 适配
│   ├── folder_picker.rs   # Windows IFileOpenDialog 目录选择器
│   ├── cli.rs             # server CLI 调用、JSON 解析和桌面端领域类型
│   ├── state.rs           # 跨浮层实例共享的状态与网页地址缓存
│   └── assets.rs          # GPUI 文件资源加载器
├── Cargo.toml
└── Cargo.lock
```

`main.rs` 必须保持为薄入口。新增功能应放入职责对应的模块，不把平台调用、CLI 管理或大段 UI 重新堆入入口文件。

## 托盘与窗口生命周期

- `tray::install()` 创建托盘图标和不可见的 1x1 GPUI 宿主窗口。宿主窗口用于维持应用事件循环，不能作为可见主窗口。
- 左键和右键都通过 `TrayIconEvent::Click` 打开或关闭同一个浮层。必须在 `MouseButtonState::Up` 时处理点击；在 `Down` 时创建窗口会与系统托盘的鼠标抬起和焦点切换竞争，导致浮层刚创建就因失焦关闭。
- 浮层使用 `WindowKind::PopUp`。已有浮层再次收到托盘点击时直接关闭；浮层激活后失焦也直接关闭。
- 打开浮层必须先使用缓存快照立即渲染，再异步刷新。不能把首次展示阻塞在 CLI 查询上，也不能每次打开时先显示无状态页面。
- `CachedState` 跨浮层实例保存服务快照、目录和 Web 地址。应用启动后预取状态与配置；成功的服务操作也要更新缓存，使浮层关闭不影响后续展示。
- 服务 CLI 操作在后台执行器中运行。面板只是管理界面，隐藏或关闭浮层不能主动终止已经开始的服务命令。
- 应用退出时由 `on_app_quit` 发起全局 `stop`。退出钩子不能同步阻塞 GPUI 主线程；CLI manager 负责后续优雅停止及超时回收 worker。

## 浮层定位与层级

- 托盘事件提供的是物理屏幕坐标。`position::beside_tray_icon()` 按托盘所在显示器的有效 DPI 转换 GPUI 逻辑尺寸，并把浮层右下角放在托盘图标左上方附近。
- 浮层创建后通过 `bring_to_front_and_align()` 使用实际 HWND 尺寸再次校准并设置为 `HWND_TOPMOST`。窗口边界变化时也要重新对齐，保证目录数量改变高度后仍锚定托盘图标。
- 多显示器映射依赖 Win32 枚举显示器顺序与 `cx.displays()`。调整定位算法时必须在主屏、副屏、不同 DPI 和任务栏位置下实测，不能只按单屏 100% 缩放计算。
- `TRAY_GAP` 控制面板和托盘图标间距。修改时要保持托盘图标可见，不得让浮层覆盖图标。
- 非 Windows 实现仅提供可编译降级；本项目实际桌面体验和目录选择功能以 Windows 为目标。

## 面板交互

- 面板标题和所有用户可见文本使用中文。面板定位为轻量托盘控制器，保持紧凑，避免加入说明型长文本或扩大为常规桌面主窗口。
- 全局启动只操作当前可启动的服务；全局停止和重启只操作当前运行中的服务。单项服务未运行时，停止和重启必须禁用。
- `busy` 表示修改操作，`refreshing` 表示只读刷新，两者不可混为同一状态。`PendingOperation` 决定具体按钮的加载动画，避免所有按钮同时显示加载态。
- 普通重启和刷新按钮使用 Segoe Fluent Icons 的刷新图标；加载状态统一使用 `assets/loading.svg` 并旋转。不要新增另一套无箭头圆环。当前动画周期为 1200ms。
- Web 入口只在网页服务状态为 `running` 且缓存中已有 Web 地址时显示。地址来自 `config --json`，监听地址 `0.0.0.0`、`::` 和 `[::]` 在浏览器 URL 中转换为 `localhost`。
- 日志按钮创建并打开仓库根 `logs/app` 或 `logs/web`。日志目录命名必须继续与 server 日志组件约定一致。
- 目录区域按条目数增加浮层高度，最多直接展示 5 行，超过后滚动。调整行高、最小高度或可见行数时同步更新 `panel_height_for_directory_count()` 的测试。

## 目录选择器

- Windows 目录选择使用 `IFileOpenDialog`，支持多选并限制为已存在的文件系统目录。不能改回会造成堆损坏或按钮无响应的窗口绑定方案。
- COM 对话框必须在独立 `std::thread` 中以 `COINIT_APARTMENTTHREADED` 初始化，并在同一线程完成创建、显示、读取结果和 `CoUninitialize()`。
- `dialog.Show(None)` 不绑定 GPUI Popup 的 HWND。对话框显示期间先取消面板置顶并隐藏面板，返回后再恢复显示和置顶，避免面板覆盖系统对话框。
- 每次打开都通过 `SetFolder` 从系统“视频”目录开始，无法获取时回退到桌面；不能沿用上一次选择位置。
- 用户取消返回 `Ok(None)`，不是错误。所选路径交给 `dir add`；删除仍使用目录索引调用 `dir del`，不直接写配置文件。

## CLI 边界

- Debug 构建在仓库根目录执行 `pnpm run server cli <命令>`。该路径使用 server 的开发启动器和 TypeScript 源码。
- Release 构建以托盘 EXE 所在目录为应用根，执行同级 `runtime/node.exe server/cli.js <命令>` 并设置 `NODE_ENV=production`，不依赖 PATH、pnpm 或 tsx。发布目录必须保持 `desktop.exe`、`runtime/node.exe` 和 `server/cli.js` 的相对布局。
- `ANIME_VIDEO_ROOT` 可覆盖默认应用根目录；未设置时 Debug 构建以 `CARGO_MANIFEST_DIR` 的父目录为根，Release 构建以当前 EXE 所在目录为根。
- 状态使用 `status --json`，目录使用 `dir list --json`，Web 地址使用 `config --json`。状态和目录查询彼此独立，当前并行执行以缩短首次加载时间。
- CLI 可能在 stdout 前输出包管理器脚本文本；JSON 解析先尝试完整输出，再从末尾寻找以 `{` 或 `[` 开始的结构化行。改变 CLI 输出时必须同时验证该兼容逻辑。
- 新增桌面功能若需要 server 数据，优先扩展正式 CLI 契约并同步文档，不在桌面端读取 server 内部文件或复制配置解析逻辑。

## 资源与依赖

- 托盘图标通过 `include_bytes!` 编入二进制并由 `image` 解码为 RGBA；面板图片和 SVG 由 `FileAssets` 从文件路径加载。
- 修改或新增资源时要确认开发运行和预期发布目录都能访问。需要完全随二进制分发的资源应使用编译期嵌入，不能只依赖当前工作目录。
- Windows API feature 应按实际使用范围添加到 `Cargo.toml` 的目标依赖中，不把 Windows 专属 crate 提升为无条件依赖。
- 修改依赖后同步提交 `Cargo.toml` 和 `Cargo.lock`。

## 验证

修改 Rust 代码后至少执行：

```powershell
cd desktop
cargo fmt --all
cargo check --offline
cargo test --offline
```

涉及 server CLI 契约或启动链时，还要从仓库根目录执行对应真实命令，例如：

```powershell
pnpm run server cli status --json
pnpm run server cli start server
pnpm run server cli status server --json
pnpm run server cli stop server
```

托盘事件、焦点、层级、目录选择器和多显示器定位无法只靠单元测试覆盖。相关修改完成后必须在 Windows 桌面会话中手动验证：

1. 左键和右键都能立即打开浮层，再次点击能关闭。
2. 点击其他窗口后浮层自动隐藏，托盘图标不被浮层覆盖。
3. 服务操作期间关闭浮层不会中断 CLI 命令，再次打开能看到最新状态。
4. 目录选择器位于面板上层，选择与取消按钮都能响应，返回后面板恢复。
5. 主屏和副屏、不同缩放比例下，浮层仍锚定对应托盘图标。

纯文档修改不需要运行 Cargo 验证。修改非 Rust 文件时仍按根 `AGENTS.md` 对相关文件执行 `pnpm exec oxfmt <相关文件>`；Rust 源码使用 `cargo fmt`。
