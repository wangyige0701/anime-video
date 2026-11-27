# 参数校验失败提示改为可读文案

- 日期：2026-11-28
- 模块：server
- 类型：修复
- 涉及模块：server

## 现象

设置页保存一个非法地址时，页面弹出的是整段 JSON：

```json
[
  {
    "origin": "number",
    "code": "too_small",
    "minimum": 1000,
    ...
  }
]
```

`Validate` 装饰器把 `ZodError.message` 直接塞进响应体的 `message` 字段，而 Zod 的 `message` 本身就是 issues 数组的字符串化结果。前端 `api.ts` 又把这字段原样弹给用户，于是每个带 `@Validate` 的接口在参数不合法时都吐 JSON，与「错误提示中文化、可操作」的既有约定相反。

## 修复

`server/decorators/validate.ts` 新增 `formatValidationMessage(issues)`：

- 只取第一条问题，拼接成「字段路径：原因」，例如 `ai.baseUrl：必须是 http(s) 地址`。
- 路径用点号连接，字段名与接口入参一致，排查时能直接对上 body。
- 没有问题项时回落到「请求参数不合法」。

`server/src/schema/settings.ts` 的 `timeout` 补中文边界提示：`.int('超时必须是整数毫秒数').min(1000, '超时不能小于 1000 毫秒').max(300000, '超时不能大于 300000 毫秒')`。其余模式（`httpUrl`、`proxy`、`userAgent`）本来就有中文文案。

## 影响面

装饰器是所有控制器共用的，因此所有接口的参数错误提示都从「JSON 数组」变成「一行中文」——是行为改善，没有接口结构变化，状态码仍是 400。

仍然保留英文的只有 `.strict()` 的未知键提示（`Unrecognized key`）。前端不会发送多余字段，为它包一层映射的收益低于成本，此处不改。

## 验证

`pnpm exec vitest run test/server/validate-message.test.ts`（6 个用例）：真实模式产出的 issues 走 `formatValidationMessage`，覆盖非法地址、空 User-Agent、超时上下界、不再出现 `"code"` 片段、无路径、无问题项六种情况。

接口冒烟（临时数据目录，假密钥）：

```
PUT /data/settings {"ai":{"baseUrl":"abc"}}      → ai.baseUrl：必须是 http(s) 地址
PUT /data/settings {"ai":{"timeout":10}}         → ai.timeout：超时不能小于 1000 毫秒
PUT /data/settings {"bangumi":{"timeout":20000}} → 200，写入成功
```

`pnpm exec tsc -p server/tsconfig.build.json --noEmit --skipLibCheck`、`pnpm exec vitest run`（39 文件 / 393 用例）通过。

## 备注

同时在同一个临时目录里复核了设置接口的验收项：空配置时 `syncAvailable` 为 false、写入假密钥后为 true、清空密钥后回到 false、`apiKeyMasked` 只给 `****1234`、probe 失败返回「AI 接口鉴权失败（HTTP 401），请检查密钥」。全程只动临时目录里的 `settings.json`，没有读写本机真实设置。
