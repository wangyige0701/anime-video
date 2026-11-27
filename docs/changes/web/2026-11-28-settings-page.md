# 新增设置页与嵌套路由分组

- 日期：2026-11-28
- 模块：web
- 类型：功能
- 涉及模块：web

## 背景

服务端已把 AI 与 Bangumi 的凭据迁到用户设置（`settings.json`），并提供 `GET/PUT /data/settings` 与两个探测接口，但前端 `views/setting.vue` 还是空壳，用户没有填写入口；详情页的同步按钮在未配置时仍然展示，点进去必然失败。

## 目标

- 设置页按分组呈现，AI 与 Bangumi 属于同一块「外部服务」配置，与后续的通用设置区分开。
- 每个分组是独立子路由，刷新与前进后退都停留在当前分组。
- 密钥只回填掩码，替换与清除都是显式动作。
- 保存后立即生效，并给出可读的连通性测试结果。
- 未配置完成时详情页不展示同步入口。

## 路由结构

| 路由 / 名称                          | 文件                         | 说明                                       |
| ------------------------------------ | ---------------------------- | ------------------------------------------ |
| `/setting`（`Setting`）              | `views/setting.vue`          | 布局：标题、左侧分组菜单、`<router-view>`，重定向到 `/setting/ai` |
| `/setting/ai`（`SettingAi`）         | `views/setting/ai.vue`       | AI 接口分组                                |
| `/setting/bangumi`（`SettingBangumi`） | `views/setting/bangumi.vue` | Bangumi 分组                               |

父级用 `definePage({ redirect })` 指向第一个分组，侧边栏「设置」仍指向父级即可。

## 涉及文件

| 文件                                          | 改动                                              | 原因                                       |
| --------------------------------------------- | ------------------------------------------------- | ------------------------------------------ |
| `web/src/views/setting.vue`                   | 改为布局页：分组菜单 + 子路由出口                 | 设置分组会持续增加，不能堆在一个页面里     |
| `web/src/views/setting/{ai,bangumi}.vue`      | 两个分组页                                        | 路由级拆分，按需加载                       |
| `web/src/components/setting/SettingSection.vue` | 卡片外壳、可用状态标签                          | 两个分组共用同一套排版与状态样式           |
| `web/src/components/setting/SettingField.vue` | 字段行（标签 + 控件）                             | 统一字段对齐，避免每页重复写布局           |
| `web/src/components/setting/SettingAdvanced.vue` | 高级折叠容器                                   | 折叠面板的主题变量只维护一处               |
| `web/src/components/setting/AiSettingsCard.vue` | AI 表单、密钥三态、保存与探测                   | 组装字段与状态，不碰布局外壳               |
| `web/src/components/setting/BangumiSettingsCard.vue` | Bangumi 表单、保存与探测                   | 同上，无密钥字段                           |
| `web/src/components/setting/useProbe.ts`      | 探测结果文案（成功带耗时、失败中文原因）          | 两个分组的展示规则一致                     |
| `web/src/api/settings.ts`                     | `getSettings` / `saveSettings` / 两个 probe       | 接口与视图类型集中声明                     |
| `web/src/stores/settings.ts`                  | `view`、`syncAvailable`、`ensure()`、`save()`     | 详情页与两个分组页共用一份状态             |
| `web/src/utils/settings.ts`                   | 表单初值与补丁构造（纯函数）                      | 只提交变化字段，便于直接测试               |
| `web/src/views/[seriesId]/[name].vue`         | 同步入口按 `syncAvailable` 显示                   | 未配置时不展示必然失败的入口               |
| `test/web/settings-patch.test.ts`             | 14 个用例                                         | 覆盖无改动、trim、密钥三态、空视图、空地址 |

## 关键取舍

1. **分组而不是平铺**：左侧菜单按 `groups` 渲染，AI 与 Bangumi 同属「外部服务」；新增设置项只需加一组，不改模板。
2. **密钥三态**：`keep / replace / clear` 三个显式动作，输入框只在替换态出现，永远不会回填明文；空输入的「替换」不提交，避免被当成清除。
3. **只提交变化字段**：补丁按服务端视图逐字段对比，设置视图尚未加载成功时返回空补丁，不会把空表单当「清空配置」写回。
4. **回填时机**：分组卡片只在首次拿到设置时回填表单；保存另一个分组后 store 更新不会覆盖本组未保存的编辑。
5. **状态写法**：加载、保存、探测中的布尔状态统一用 `useVueStatusRef`；store 不再维护重复的 `loading`。
6. **探测提示**：业务失败由响应拦截器抛普通 `Error`（服务端中文原因），网络失败交给 `getApiErrorMessage` 翻译，结果只展示一行文案。
7. **主题适配**：卡片用 `detail-metadata-bg` 深色面板；可用状态不用 `el-tag`（深色主题下是亮底砖），改为低透明度底色 + 状态点；文本按钮在紫色底上默认不可见，按分组覆盖文字色。

## 验证

- `pnpm --filter web type-check`：通过（含 `definePage` 的嵌套路由名称联合类型校验）。
- `pnpm --filter web build`：通过，设置页独立分包。
- `pnpm exec vitest run`：全部用例通过（新增 14 个补丁用例）。
- 手工冒烟（`pnpm server dev` + `pnpm web dev`，无头 Chrome 截图）：
  - `/setting` 自动跳转 `/setting/ai`，左侧「外部服务」分组下 AI 接口为选中态；
  - 切到 `/setting/bangumi` 只显示 Bangumi 卡片，菜单选中态跟随；
  - 「替换」出现密码输入框与取消，「清除」显示「保存后清除密钥」，「撤销」可回到原状态；
  - 无改动点保存提示「AI 设置没有改动」，不发请求；
  - 已配置项显示绿色状态点，未配置显示中性色，深色面板上文字清晰；
  - 展开「高级」后代理与超时输入框与上方字段对齐，无溢出。

## 关联文档

- `web/AGENTS.md` 的「设置页」
- `docs/changes/server/2026-11-28-remove-env-runtime.md`
- `docs/changes/server/2026-11-28-user-settings-store.md`
