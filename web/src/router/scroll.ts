import { nextTick } from 'vue';
import type { Router } from 'vue-router';

/**
 * 路由切换时的滚动位置记忆。
 *
 * 全局唯一的滚动容器是 `App.vue` 里常驻的 `el-scrollbar`，不是 `window`，
 * 因此 vue-router 的 `scrollBehavior` 用不上：那套只操作 `window` 或它拿到的元素，
 * 且只在 history 自身管理的滚动里生效。这里自己记每个历史记录项的位置。
 *
 * 为什么按 `history.state.position` 而不是 `fullPath` 记：同一路径会被访问多次
 * （首页 → 详情 → 首页 → 另一个详情），按路径记会把不同次访问的位置混在一起。
 * `position` 是 vue-router 给每条历史记录的序号，天然区分「回退到上一次」与「进入一个新页面」：
 * 新页面的序号没有记录，落到 `0`，正是「新页面从顶部开始」这个默认行为。
 */

/** 滚动容器的最小接口：只用到读位置与设位置，便于用假容器单测 */
export interface ScrollTarget {
	/** 读取当前滚动距离 */
	get(): number;
	/** 设置滚动距离；超出内容高度时由容器自行截断 */
	set(top: number): void;
}

/**
 * 创建一份滚动位置记录表。
 *
 * 容器通过函数取而不是直接持有，因为这张表在模块加载时就要建好，
 * 而容器的 ref 要等 `App.vue` 挂载后才有值。
 */
export function createScrollMemory(target: () => ScrollTarget | null) {
	const positions = new Map<number, number>();

	return {
		/** 离开前记录当前历史记录项的位置 */
		save(position: number) {
			const container = target();
			if (!container) {
				return;
			}
			positions.set(position, container.get());
		},
		/** 切到某个历史记录项：有记录就恢复，没有记录则回到顶部；返回目标位置 */
		restore(position: number) {
			const top = positions.get(position) ?? 0;
			target()?.set(top);
			return top;
		},
		/** 容器是否已经能容纳到 `top`：内容还没渲染够高时 `scrollTop` 会被截断 */
		reached(top: number) {
			const container = target();
			return !container || container.get() >= top;
		},
		/** 同一条历史记录被替换成新地址（如首页改过滤条件）：不是回退，从顶部开始 */
		reset() {
			target()?.set(0);
		},
		/** 历史记录已被替换掉，旧位置不再有意义，别留给下一次回退误用 */
		forget(position: number) {
			positions.delete(position);
		},
	};
}

/** 内容高度不足导致落不下时逐帧重试的次数，约 20 帧（330ms）仍不行就放弃 */
const MAX_RESTORE_FRAMES = 20;

let target: ScrollTarget | null = null;

/** 由 `App.vue` 在挂载后注入真正的滚动容器 */
export function setScrollTarget(next: ScrollTarget | null) {
	target = next;
}

const memory = createScrollMemory(() => target);

/** `position` 是 vue-router 写入 history.state 的序号，直接访问 URL 时还没有 */
function historyPosition() {
	const state = window.history.state as { position?: unknown } | null;
	const position = state?.position;
	return typeof position === 'number' ? position : null;
}

/**
 * 当前所在的历史记录项。
 *
 * 不能在 `beforeEach` 里直接读 `history.state.position`：后退时浏览器已经把 history
 * 切到目标页，读出来的是「要去的页面」而不是「要离开的页面」，
 * 于是保存动作会把目标页原来的记录覆盖成后退瞬间的位置（0），正好抹掉要恢复的值。
 */
let currentPosition: number | null = null;

export function scrollGuard(router: Router) {
	router.beforeEach(() => {
		if (currentPosition !== null) {
			memory.save(currentPosition);
		}
	});

	router.afterEach(async (to, from, failure) => {
		// 失败或被拦下的导航（重复导航、守卫取消）不会改变历史记录，
		// 此时恢复位置只会把用户刚滚到的位置拉回去——典型是已在本页再点一次侧边栏「首页」
		if (failure) {
			return;
		}
		const position = historyPosition();
		// 序号没变却换了地址 = 同一条历史记录被 replace；序号没变且地址也没变 = 原地刷新，保持位置
		const replaced = position !== null && position === currentPosition && to.fullPath !== from.fullPath;
		currentPosition = position;
		if (position === null) {
			return;
		}
		// 等新视图渲染完，否则读到的还是旧页面的内容高度
		await nextTick();
		if (replaced) {
			// 旧页面已经不在历史栈里，它记下的位置也跟着作废
			memory.forget(position);
			memory.reset();
			return;
		}
		restore(position);
	});
}

function restore(position: number, attempt = 0) {
	const top = memory.restore(position);
	if (top === 0 || memory.reached(top) || attempt >= MAX_RESTORE_FRAMES) {
		return;
	}
	requestAnimationFrame(() => restore(position, attempt + 1));
}
