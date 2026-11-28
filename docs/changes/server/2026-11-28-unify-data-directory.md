# 用户设置与目录白名单统一到同一套数据目录规则

- 日期：2026-11-28
- 模块：server
- 类型：修复
- 涉及模块：server

## 现象

同一个仓库里两条「应用数据」链路各走各的目录：

| 数据                                 | 决定路径的代码                                                       | 直接运行 server（开发） | 桌面 EXE     |
| ------------------------------------ | -------------------------------------------------------------------- | ----------------------- | ------------ |
| 全局目录白名单 `<prefix>.video.json` | `data/common.ts` 私有 `getDataDirectory()`，判 `ANIME_VIDEO_DESKTOP` | 服务目录                | 系统用户目录 |
| 用户设置 `settings.json`             | `settings/store.ts` 直接调 `getUserDataDirectory()`                  | **系统用户目录**        | 系统用户目录 |

后果：本地 `pnpm server dev` 读写的是已安装应用正在用的那份 `settings.json`——开发时保存一次 AI 配置就把正式环境凭据顶掉，正式环境的密钥在开发态也直接可读。目录白名单没有这个问题，因为它在开发态落在服务目录。

另外两个附带问题：

- `ANIME_VIDEO_DATA_DIR` 在非桌面模式下对目录白名单**无效**（`getDataDirectory()` 的分支根本没读它），隔离只能靠 `SERVER_VIDEO_CONFIG_PREFIX=test` 换文件名。
- `scripts/migrate-env.mjs` 又把平台目录规则抄了第三份，改一处忘两处。

## 修复

1. `src/utils/user-data-dir.ts` 成为唯一规则入口，新增 `getDataDirectory()`：

    ```ts
    const isolated = Boolean(process.env.ANIME_VIDEO_DATA_DIR?.trim());
    if (isolated || process.env.ANIME_VIDEO_DESKTOP === '1') return getUserDataDirectory();
    return getServerRoot();
    ```

    优先级：`ANIME_VIDEO_DATA_DIR` > 桌面标记 > 服务目录。

2. `data/common.ts` 删掉私有 `getDataDirectory()` 与 `ensureDesktopDataDirectory()`，改为引用共享函数；`ensureDataDirectory()` 无条件 `mkdir`（桌面路径可能不存在，开发目录本来就在）。白名单顺带获得 `ANIME_VIDEO_DATA_DIR` 隔离能力。
3. `settings/store.ts` 的 `getSettingsFile()` / `getStore()` 改用 `getDataDirectory()`。
4. `scripts/migrate-env.mjs` → `scripts/migrate-env.ts`：删除抄来的 `resolveUserDataDirectory()`，改为 import 服务的 `getDataDirectory()`，写入位置与运行时读取位置不可能再错开。脚本用 `pnpm --filter server exec tsx ../scripts/migrate-env.ts` 运行（`tsx` 是 server 包依赖，根目录没有）。
5. `.gitignore` 增加 `server/settings.json`：开发态凭据会落在仓库里，必须挡在提交之外。
6. `test/server/migrate-env.test.ts` 改为直接 import TS 模块，删掉「按结构声明导出」的临时类型。

## 行为变化

- 开发态（`pnpm server dev`）：`settings.json` 从 `%LOCALAPPDATA%\Anime Video\` 移到 `server/settings.json`，与 `<prefix>.video.json` 同目录。**开发态首次需要重新填一次 AI/Bangumi 配置**；已安装应用的数据不受影响，也不去动它。
- 桌面 EXE：路径不变（仍是系统用户目录）。
- 测试：`ANIME_VIDEO_DATA_DIR` 依然优先，现有 `settings.test.ts` 的临时目录隔离照旧生效。

## 验证

- `test/server/data-directory.test.ts`（新增 3 例）：override 优先、桌面态落用户目录、开发态落服务目录且与目录白名单同目录。
- 实机打印确认（`node --import tsx -e`，不启动服务、不扫媒体）：

    ```
    开发态 dataDir  = E:\Projects\anime-video\server
    期望 settings   = E:\Projects\anime-video\server\settings.json
    用户目录候选    = C:\Users\Administrator\AppData\Local\Anime Video
    桌面态 dataDir  = C:\Users\Administrator\AppData\Local\Anime Video
    ```

- 直接调用 `updateSettings()` 确认写入 `server\settings.json`，验证后删除该文件；全程没有读写 `%LOCALAPPDATA%\Anime Video\settings.json`。
- `pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`、`pnpm exec vitest run`（40 文件 / 398 用例）通过。

## 文档

`server/AGENTS.md`（磁盘布局、用户设置存储位置、`src/utils/` 职责）、`docs/configuration.md`（个人凭据、目录白名单）、`docs/modules/server/bangumi-sync.md`（配置来源与迁移命令）同步；`server/src/integrations/bangumi/config.ts` 的注释里的脚本名一并更新。
