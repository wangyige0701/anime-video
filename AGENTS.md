# Anime Video 项目开发约定

## 文档适用范围

本文件描述仓库根目录、跨项目依赖和 pnpm monorepo 的整体结构，适用于整个仓库。进入子项目修改前还必须阅读对应文档：

- `server/AGENTS.md`：Koa 服务端、数据层、HLS Node 封装、接口与日志约定。
- `web/AGENTS.md`：Vue 前端、播放器、数据层、状态管理、样式与组件约定。
- `hls/AGENTS.md`：C++ 原生扩展、FFmpeg、分片和预览图轨道约定。
- `desktop/AGENTS.md`：GPUI 托盘窗口、Windows 定位与目录选择器、CLI 调用和桌面交互约定。

子目录文档对其目录内实现提供更具体的约束；根文档负责跨目录边界，不能用根级概述替代子项目规范。修改项目结构、workspace 配置、共享模块或跨项目调用关系时同步维护本文件；只修改单一子项目内部架构时，至少同步维护该子项目的 `AGENTS.md`。

## 项目概览

项目由 Vue 播放器前端、Koa API 服务、HLS 原生扩展、Windows 桌面托盘控制端和根目录共享契约组成。主要调用关系如下：

```text
web (Vue + hls.js)
  -> HTTP API / HLS 请求
server (Koa + 装饰器 controller)
  -> N-API
hls (C++ + FFmpeg)
  -> 本地视频文件
desktop (GPUI + tray-icon)
  -> server CLI（服务与视频目录管理）
```

`web` 和 `server` 是 pnpm workspace 包；`hls` 是 Git 子模块和独立 pnpm/CMake 项目。根目录的 `shared/`、`types/` 是源码级共享模块，不是独立 workspace 包。

## 根目录结构

```text
anime-video/
├── shared/                 # 配置解析、配置类型、系列枚举和 HTTP 状态码
├── types/                  # API 响应及 Series/Season/Episode 共享类型
├── server/                 # Koa API、数据层、HLS Node 封装和 Web 托管入口
├── web/                    # Vue、Vite、Pinia、hls.js 前端应用
├── hls/                    # Git 子模块；C++/FFmpeg Node 原生扩展
├── desktop/                # 独立 Cargo 项目；Windows 托盘服务控制与目录管理浮层
├── dev/                    # 开发期辅助脚本和实验性测试，不属于正式运行入口
├── ui/                     # 设计与界面参考图片
├── docs/                   # 配置覆盖与开发文档
├── front.cmd               # Windows 下把参数转发给 web workspace 脚本
├── back.cmd                # Windows 下把参数转发给 server workspace 脚本
├── clear.mjs               # 根构建前清空 dist（包括其中的 Junction/符号链接）
├── build-desktop.mjs       # 编译并复制桌面端发布 EXE
├── package.json            # workspace 根包和根级工具依赖
├── pnpm-workspace.yaml     # workspace 范围、依赖覆盖和安装策略
├── pnpm-lock.yaml          # 根包、server、web 共用的唯一锁文件
├── tsconfig.json           # 服务端及共享源码的基础 TypeScript 配置和别名
└── vitest.config.ts        # 仓库测试发现、环境变量和别名配置
```

以下目录可能存在于本地，但不属于当前受版本控制的主项目结构：

- `node_modules/`：pnpm 安装产物。
- `web/dist/`：Vite 默认构建产物。
- `hls/build/`：CMake 原生扩展构建产物。
- `remux/`：被根 `.gitignore` 排除的独立本地目录，不能作为主仓库代码依赖。
- 根目录 `www/` 当前不是 workspace 构建目标；服务端静态目录以 `config.yaml` 和 `server/cli/web.ts` 的实际解析结果为准。

## pnpm Monorepo

### Workspace 边界

`pnpm-workspace.yaml` 只声明以下包：

```yaml
packages:
    - 'server'
    - 'web'
```

根 `package.json` 同时作为 workspace root importer，提供 TypeScript、Vitest、Prettier、`cross-env` 和 `@wang-yige/utils` 等根级依赖。根 `pnpm-lock.yaml` 的 importer 必须保持为根目录、`server`、`web` 三部分；修改其中任一包的依赖后，从仓库根目录执行 pnpm 安装并提交同一份锁文件。

当前包之间没有 `workspace:*` 依赖。`web` 和 `server` 通过 HTTP 交互，并通过 TypeScript 路径别名读取根目录共享源码；不要为了共享少量类型而让前端直接导入服务端实现，也不要在子包中复制共享契约。

### 安装策略

在仓库根目录执行：

```powershell
pnpm install
```

该命令安装根包、`server` 和 `web`。`pnpm-workspace.yaml` 还有以下全局约束：

- Vue 及其 compiler/runtime 包通过 `overrides` 统一解析为 `beta`，实际版本应以根锁文件为准，不能只根据 `web/package.json` 的声明判断。
- `peerDependencyRules.allowAny` 允许 Vue peer 版本差异；调整 Vue 版本时必须同时验证 compiler、runtime、Vite 插件和 Element Plus。
- `allowBuilds` 只明确允许 `@parcel/watcher` 与 `esbuild` 的安装构建脚本。
- `minimumReleaseAge` 当前为 `0`，没有新增包发布时间等待限制。

`hls/` 不属于 workspace，拥有自己的 `package.json` 和 `pnpm-lock.yaml`。安装或更新原生扩展依赖必须在该目录独立执行：

```powershell
pnpm --dir hls install --ignore-workspace
```

不要用根锁文件替代 `hls/pnpm-lock.yaml`，也不要在没有评估构建、Node ABI 和发布方式前把 `hls` 加入根 workspace。首次获取仓库时还需要初始化 Git 子模块，`hls` 的提交指针变更应作为子模块变更单独审查。

`desktop/` 同样不属于 pnpm workspace，是独立的 Cargo 项目。它在开发构建中从仓库根目录执行 `pnpm run server cli <命令>`，调用既有的服务管理、配置查询与目录管理 CLI；发布构建以托盘 EXE 所在目录为根，通过同级 `runtime/node.exe` 执行 `server/cli.js`。桌面端启动后预取服务状态与 `config --json` 提供的 Web 地址，退出时通过 CLI 停止全部受管服务；不得绕过 CLI 直接修改服务 manager 状态或 `.video.json`。

### 脚本与过滤器

根 `build` 脚本首先执行 `clear.mjs`，完整删除根 `dist/` 及其中的 Junction/符号链接，再依次构建 web、server 和 desktop；服务端发布产物输出到 `dist/server/`，桌面端发布产物输出到 `dist/desktop.exe`。`build:desktop` 使用 Cargo 的 release 配置编译 `desktop/Cargo.toml`，再复制生成的 Windows 可执行文件。根脚本 `web` 和 `server` 分别调用 `front.cmd`、`back.cmd`，再把后续参数转发给对应 workspace 包。`back.cmd` 对 `cli` 单独调用 `server/cli-launcher.mjs`，由启动器还原 Windows 下 `pnpm run` 产生的一层反斜杠转义，通过 Node 的 `--import tsx` 启动 TypeScript CLI，并在 Windows `uv_os_get_passwd` 因 `ENOMEM` 失败时启用当前用户信息兼容层；这也避免 CLI 参数再次经过 workspace 脚本转义。其他服务端脚本仍通过 workspace 转发。因此 Windows 下可使用：

```powershell
pnpm web dev
pnpm web build
pnpm server dev
pnpm server dev:web
pnpm dev:desktop
```

日志 transport 的 TypeScript 运行时文件需要在开发或构建前编译；控制台与文件输出共用一个 worker，关闭文件输出时也需要编译：

```powershell
pnpm build:log-transport
```

主线程待写及在途日志由 `logging.maxQueueBytes` 限制，默认 4MiB，过载丢弃新记录并向 stderr 告警。
该配置同时维护在 `config.yaml`、`shared/config.d.ts` 和 `docs/configuration.md`；日志关闭和资源释放约定见 `server/AGENTS.md`。

等价且更适合跨平台或自动化环境的写法是直接使用 filter：

```powershell
pnpm --filter web dev
pnpm --filter web build
pnpm --filter server dev
pnpm --filter server dev:web
```

常用验证命令：

```powershell
pnpm --filter web type-check
pnpm exec tsc --noEmit -p server/tsconfig.json
pnpm exec vitest run
```

根 Vitest 配置发现 `**/test/**/*.test.ts`，排除 `dev/**`，并为数据层测试设置 `SERVER_VIDEO_CONFIG_PREFIX=test` 和 `SERVER_DATA_FILE_SAVE_DELAY=0`。`server/package.json` 当前没有可用的正式 `test` 脚本，不能把其中的占位失败脚本当作验证命令。

原生扩展使用自己的脚本和 CMake 环境：

```powershell
pnpm --dir hls run build
pnpm --dir hls run build:q
```

具体 FFmpeg、编译器、Node ABI 和验证要求遵循 `hls/AGENTS.md`。

## 共享源码与别名

根 `tsconfig.json` 定义以下主要别名：

- `~server/*` -> `server/*`
- `~web/*` -> `web/*`
- `~shared/*` -> `config/*`
- `~types/*` -> `types/*`
- `~hls/*` -> `hls/build/*`

`server/tsconfig.json` 继承根配置，并把服务端、`shared/`、`types/` 纳入编译。`web/tsconfig.app.json` 单独提供 `@/* -> web/src/*`，并允许前端读取 `~shared/*`、`~types/*`；共享系列枚举随前端导入纳入编译。Vite 的 `web/vite/alias.ts` 从该配置生成运行时 alias，因此修改前端别名时必须同时保证 TypeScript 和 Vite 能解析。

共享目录职责如下：

- `shared/` 保存配置解析、配置类型及 `series-status.ts`、`series-types.ts` 系列枚举，以及 `http-status.ts` HTTP 请求响应状态码，不保存组件局部状态。系列枚举供两端复用；`config-parser.ts` 依赖 Node，只供服务端和构建工具使用，不能导入浏览器运行时代码。
- `shared/server-route-config.ts` 保存 API 根路径、URL 生成函数和服务端地址；`shared/web-route-config.ts` 保存前端路由名称。
- `types/` 保存网络 DTO 与跨端类型，不能依赖浏览器或 Node 专属实现。

共享类型、路由或配置发生变化时，要同时检查服务端生产者、前端消费者、测试和两个子项目的 `AGENTS.md`，保证契约描述与实现一致。

## 运行关系

- `server/app.ts` 按 `server` 或 `web` 参数在分支内动态导入并启动对应服务；API 实现在 `server/cli/server.ts`，默认监听 `0.0.0.0:3000`。
- Vite 开发服务由 `web` 的 `dev` 脚本启动，固定开发端口配置为 `5173`。
- `server/cli/web.ts` 在 `3001` 提供静态资源与 history fallback。静态目录由 `config.yaml` 中的 `web.webBundleDir` 配置，相对路径基于 `server/cli/` 解析；当前没有根脚本自动把 `web/dist` 部署到该位置，修改构建或部署流程时必须显式维护这一步。

分别执行开发脚本时，API、Vite 和静态 Web 运行在独立进程中。`server/app.ts` 按目标分支动态导入服务；`server/cli.ts` 通过常驻 manager 分别持有 server/web worker，跨终端复用进程句柄。`config --json` 输出合并覆盖后的完整生效配置；`dir` 子命令通过 `server/cli/directories.ts` 管理系列根目录，`list` 输出当前配置，`list --json` 输出目录数组 JSON，`set` 用空格分隔的目录参数替换配置，`add` 在现有配置末尾追加未配置的目录，`del` 接收空格或逗号分隔的索引并删除配置项。CLI 管理器按当前模块扩展名定位源码或保留目录结构的编译入口，构建布局约束见 `server/AGENTS.md`；完整发布构建、自动崩溃恢复和状态持久化仍待实现。端口和地址来自 `config.yaml`、`shared/server-route-config.ts`，调整时必须检查前端 URL 和测试。

## 代码格式要求

- 条件分支即使只有一条语句，也必须使用大括号并换行书写；禁止将 `if`、`else`、循环或类似分支压缩为单行。
- 修改 `hls/` 以外的代码后必须执行 `pnpm exec oxfmt <相关文件>` 格式化相关文件，并保持现有缩进、引号、分号和换行风格；`hls/` 作为独立子项目，不使用 oxfmt。

## 跨项目修改原则

1. 修改共享契约时先确定唯一归属，优先更新根目录的 `shared/` 或 `types/`，不要在 `web` 和 `server` 各维护一份常量。
2. 修改原生 HLS 接口时同步检查 C++ N-API 导出、`server/hls.d.ts`、`server/src/hls.ts`、HTTP controller 和前端 hls.js 调用方。
3. 新增依赖时放入实际使用它的 importer；只有跨项目工具或根配置直接使用的依赖才放根 `package.json`。
4. 所有修改保持现有功能与接口兼容，验证范围按受影响项目扩大；跨端修改至少分别执行对应类型检查或构建。
5. 根结构、workspace 包、脚本、别名、端口或共享目录职责变化后，必须在同一次修改中更新本文件；子项目内部变化遵循对应 `AGENTS.md` 的同步要求。
