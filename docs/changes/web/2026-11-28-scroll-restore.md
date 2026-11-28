# 回退时保持首页滚动位置

- 日期：2026-11-28
- 模块：web
- 类型：修复

## 现象

首页滚到中间（或滚动加载了多页）后点开详情，再按浏览器后退，首页回到顶部；已加载的页数也退回第一页（40 条）。

## 根因

三处叠加，缺一处都看不到效果。

**1. 原生能力用不上。** 主滚动容器是 `App.vue` 里常驻的 `el-scrollbar`，`.container` / `.main` 都是 `overflow: hidden`，`window` 不滚。vue-router 5.3.0 的 `scrollBehavior` 最终走 `window.scrollTo()`，`{ el, top }` 里的 `el` 也只在 `getElementPosition()` 里算元素到文档的偏移，不是「滚动该元素内部」。所以 `savedPosition` 永远拿不到、也用不上。

**2. `keep-alive` 没命中。** `App.vue` 写的是 `<keep-alive :include="[WebRoute.INDEX]">`，即 `['Index']`；而 `views/index.vue` 没有声明组件名，`<script setup>` 按文件名推断出 `index`。`include` 是严格比较，差一个大小写就不缓存。于是后退时 `Index` 重建，`page` 回到 1、`datas` 被重置，列表高度不够，即便恢复 `scrollTop` 也只能落在很浅的位置。

**3. 保存时机读错了序号。** 后退时浏览器已经把 `history` 切到目标页，`beforeEach` 里读 `history.state.position` 得到的是「要去的页面」，拿它当 key 保存，就把目标页原本记录的 2400 覆盖成详情页的 0。

实测记录（真实库，1440×900）：

```
离开前  cards 41  top 2400
详情页  cards 0   top 0
回退后  cards 40  top 0     ← 修前：位置丢失、分页丢失
```

## 修复

- 新增 `web/src/router/scroll.ts`：`createScrollMemory()` 管理「历史序号 → 滚动位置」，`scrollGuard()` 挂 `beforeEach` / `afterEach`。
- 用 `currentPosition` 自己跟踪上一次导航结束时的序号，`beforeEach` 用它保存，不再直接读 `history.state`。
- `App.vue` 给 `el-scrollbar` 加 `ref`，挂载后经 `setScrollTarget()` 注入容器（直接读写原生 `wrap.scrollTop`，同步生效）。
- 恢复前 `await nextTick()`；因内容高度不足被截断时逐帧重试，最多 20 帧。
- 同一序号换地址（replace）视为新页面：删记录并回到顶部。
- `views/index.vue` 增 `defineOptions({ name: WebRoute.INDEX })`，与 `include` 对齐。

## 验证

真实库（41 部，1440×900）：

```
离开前  cards 41  top 2400
详情页  top 0
回退后  cards 41  top 2400   ← 位置与分页都保持
第二次进详情 top 0，回退 top 3519（与离开时一致）
```

固定夹具（200 部，翻到第 5 页）：

```
离开前  cards 200  top 12000  scrollHeight 22258
回退后  cards 200  top 12000  scrollHeight 22258
```

单测 `test/web/scroll-memory.test.ts`（5 例）覆盖：恢复原位置、无记录回顶部、多序号互不干扰、容器未就绪不抛错、内容不足时判定未到达并可在补高后落位。

## 影响面

- 新增两次守卫回调与一张 `Map`，无额外请求；`keep-alive` 命中后首页组件常驻，从详情页返回不再重建列表（数据变更仍由 `refreshEmitter` 推送）。
- 未改动 `window` 滚动、布局与任何渲染结构；前进/后退之外的行为（首次进入、replace）与之前一致。
- 搜索页等未被 `keep-alive` 缓存的页面同样会记录位置，但组件重建后要等列表渲染完，逐帧重试上限 20 帧，数据请求较慢时可能恢复不到原处。
