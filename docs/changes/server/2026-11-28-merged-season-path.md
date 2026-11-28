# 合并系列的季路径前缀拼出 Promise 字符串

- 日期：2026-11-28
- 模块：server
- 类型：修复

## 现象

合并系列后打开「同步 Bangumi」，匹配步骤里成员系列的季标题显示成 `[object Promise] / 第二季`，主系列自己的季正常。

## 原因

`readLocalSeasons()` 给成员季拼来源前缀时直接取了 `series.title`：

```ts
const prefix = index === 0 ? '' : series.title;
path: prefix ? `${prefix} / ${seasonName}` : seasonName,
```

`Series` 的字段 getter（`title`、`seasons`、`description` 等）读的是数据层的异步字段，返回的是 **Promise**。这里上一行 `await series.seasons`、下面 `await season.title` 都带了 await，唯独 `series.title` 漏了，模板字符串对它做隐式 `toString()` 就得到 `[object Promise]`。

之所以只在合并场景暴露：主系列走 `index === 0` 分支，`prefix` 是空串，压根不碰 `series.title`。

## 修复

```ts
const prefix = index === 0 ? '' : await series.title;
```

顺带核对了同文件与 `BangumiController` 的其余字段取值：`Promise.all([... series.title ...])`、`await season.title`、`await season.id` 都正确，只有这一处遗漏。

## 验证

`test/server/bangumi-merge-scope.test.ts` 的假对象把 `title` 从字符串改成 `Promise.resolve(title)`，与真实 `Series` 的 getter 形状一致。

- 改测试后、未改实现时该用例失败，报错为 `expected [ '正片', '[object Promise] / 正片' ]`，与用户截图症状一致；
- 加上 `await` 后通过；全量 `vitest run`（45 文件 440 例）通过，`tsc -p server/tsconfig.build.json` 无报错。

## 影响面

仅影响合并系列同步时成员季的展示名，串接与写回逻辑不变。接口返回的 `path` 从 `[object Promise] / 二季` 恢复为 `系列名 / 二季`，前端无需改动。
