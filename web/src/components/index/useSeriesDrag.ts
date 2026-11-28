import { useEventListener, useRafFn } from '@vueuse/core';
import { onScopeDispose, reactive, ref } from 'vue';
import { endReachedEmitter } from '@/events/end-reached';
import { getMergeRejection } from '@/utils/seriesMerge';

/**
 * 首页系列卡片的拖拽合并交互。
 *
 * 没有使用拖拽库：这里既不是排序也不是列表间搬运，而是「拿起一张卡片、悬停在另一张上、松手合并」，
 * 需要完全控制浮层的翻转与飞入动画、边缘自动滚动、以及拖拽期间的滚动加载，
 * 通用拖拽库的占位与镜像机制反而会与这些行为冲突。
 *
 * 监听器在作用域内一次性注册，`useEventListener` / `useRafFn` 负责随作用域销毁自动解绑；
 * 每个处理器用 `pointerId` 判断当前是否处于一次按下中，空闲时直接返回。
 * 这样不需要成对地挂载与卸载监听，也不会因为分支不同而漏掉某条清理路径。
 *
 * 只响应鼠标与手写笔：触摸设备上按下即拖会抢走页面滚动，手势冲突无法优雅消解。
 */

/** 起拖需要的移动距离，低于该值仍视为点击，保证卡片可以正常跳转 */
const DRAG_THRESHOLD = 6;
/** 距离滚动容器上/下边缘多少像素开始自动滚动 */
const SCROLL_EDGE = 90;
/** 每帧最大滚动距离，避免指针略微越界就飞速滚动 */
const SCROLL_MAX_STEP = 26;
/** 滚动到底后请求下一页的最小间隔 */
const END_REACHED_INTERVAL = 500;

/** 浮层需要的系列信息，由调用方组装，避免组合式函数依赖数据层 */
export interface DragSeriesInfo {
	id: string;
	title: string;
	imageUrl: string;
}

export type DragPhase = 'idle' | 'drag' | 'drop' | 'return';

interface DragState {
	/** 当前阶段，决定浮层的过渡动画 */
	phase: DragPhase;
	/** 正在拖拽的系列 id，空串表示没有拖拽 */
	sourceId: string;
	title: string;
	imageUrl: string;
	/** 浮层左上角坐标与尺寸，直接写入 transform 与宽高 */
	x: number;
	y: number;
	width: number;
	height: number;
	scale: number;
	opacity: number;
	/** 抓取点相对卡片左上角的偏移，保证浮层不会在按下瞬间跳到指针中心 */
	offsetX: number;
	offsetY: number;
}

export interface UseSeriesDragOptions {
	/** 成员索引：成员 id → 主系列 id，用于判断目标是否可合并 */
	owners: () => Map<string, string>;
	/** 松手在合法目标上时调用，返回是否合并成功 */
	onMerge: (sourceId: string, targetId: string) => Promise<boolean>;
}

export function useSeriesDrag(options: UseSeriesDragOptions) {
	const state = reactive<DragState>({
		phase: 'idle',
		sourceId: '',
		title: '',
		imageUrl: '',
		x: 0,
		y: 0,
		width: 0,
		height: 0,
		scale: 1,
		opacity: 1,
		offsetX: 0,
		offsetY: 0,
	});
	/** 当前悬停的合法目标系列 id，空串表示没有目标 */
	const targetId = ref('');

	/** 当前按下的指针 id，-1 表示没有按下；所有处理器都以它作为「是否处于一次交互中」的判据 */
	let pointerId = -1;
	let startX = 0;
	let startY = 0;
	let pointerX = 0;
	let pointerY = 0;
	let card: HTMLElement | null = null;
	let info: DragSeriesInfo | null = null;
	let endReachedAt = 0;
	/** 松手瞬间的目标矩形，飞入动画期间不再重新测量，避免列表重排导致落点漂移 */
	let dropRect: DOMRect | null = null;
	/** 回位动画的收尾定时器，作用域销毁时必须清掉，否则会在已卸载的实例上改 body 样式 */
	let resetTimer: ReturnType<typeof setTimeout> | undefined;

	/** 拖拽期间的逐帧任务：自动滚动 + 命中检测 */
	const loop = useRafFn(
		() => {
			autoScroll();
			updateTarget();
		},
		{ immediate: false },
	);

	/**
	 * 记录按下位置，真正的拖拽要等移动超过阈值才开始。
	 *
	 * @param event 卡片上的 pointerdown
	 * @param element 卡片根元素
	 * @param series 系列信息，用于渲染浮层
	 */
	function begin(event: PointerEvent, element: HTMLElement, series: DragSeriesInfo) {
		if (event.pointerType === 'touch' || event.button !== 0) {
			return;
		}
		if (state.phase !== 'idle') {
			return;
		}
		card = element;
		info = series;
		pointerId = event.pointerId;
		startX = pointerX = event.clientX;
		startY = pointerY = event.clientY;
	}

	/** 首次越过阈值时激活拖拽：测量视觉区域、生成浮层、启动跟随循环 */
	function activate() {
		if (!card || !info) {
			return;
		}
		// 浮层只需要海报区域，取 image-wrap 的尺寸能让飞入目标时的落点与原图重合
		const visual = (card.querySelector('[data-drag-visual]') as HTMLElement | null) ?? card;
		const rect = visual.getBoundingClientRect();
		state.width = rect.width;
		state.height = rect.height;
		state.offsetX = startX - rect.left;
		state.offsetY = startY - rect.top;
		state.x = rect.left;
		state.y = rect.top;
		state.scale = 1;
		state.opacity = 1;
		state.title = info.title;
		state.imageUrl = info.imageUrl;
		state.sourceId = info.id;
		state.phase = 'drag';
		card.classList.add('is-drag-source');
		// 拖拽期间禁止选中文本，否则长时间按下会把卡片文字框选出来
		document.body.style.userSelect = 'none';
		document.body.style.cursor = 'grabbing';
		loop.resume();
	}

	function onPointerMove(event: PointerEvent) {
		if (pointerId === -1 || event.pointerId !== pointerId) {
			return;
		}
		if (state.phase === 'idle') {
			if (Math.hypot(event.clientX - startX, event.clientY - startY) < DRAG_THRESHOLD) {
				return;
			}
			activate();
			if (state.phase === 'idle') {
				return;
			}
		}
		if (state.phase !== 'drag') {
			return;
		}
		pointerX = event.clientX;
		pointerY = event.clientY;
		state.x = pointerX - state.offsetX;
		state.y = pointerY - state.offsetY;
		// 拖拽期间阻止默认行为，避免图片被浏览器当作原生拖拽对象
		event.preventDefault();
	}

	/** 指针靠近滚动容器边缘时持续滚动，触底后再请求下一页 */
	function autoScroll() {
		const scroller = getScroller();
		if (!scroller) {
			return;
		}
		const rect = scroller.getBoundingClientRect();
		let step = 0;
		if (pointerY < rect.top + SCROLL_EDGE) {
			step = -Math.ceil((rect.top + SCROLL_EDGE - pointerY) / 5);
		} else if (pointerY > rect.bottom - SCROLL_EDGE) {
			step = Math.ceil((pointerY - (rect.bottom - SCROLL_EDGE)) / 5);
		}
		if (!step) {
			return;
		}
		const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
		const distance = Math.min(SCROLL_MAX_STEP, Math.abs(step));
		const next = Math.min(max, Math.max(0, scroller.scrollTop + Math.sign(step) * distance));
		scroller.scrollTop = next;
		// 已经到底且仍在向下拖，说明需要更多数据；复用列表已有的触底加载通道
		if (step > 0 && next >= max - 1) {
			const now = Date.now();
			if (now - endReachedAt > END_REACHED_INTERVAL) {
				endReachedAt = now;
				endReachedEmitter.emit('endReached', { direction: 'bottom' });
			}
		}
	}

	/** 命中检测：浮层本身是 pointer-events: none，因此 elementFromPoint 拿到的永远是卡片 */
	function updateTarget() {
		const element = document.elementFromPoint(pointerX, pointerY);
		const hovered = element?.closest<HTMLElement>('[data-series-id]');
		const id = hovered?.dataset.seriesId ?? '';
		if (!id || id === state.sourceId || getMergeRejection(state.sourceId, id, options.owners())) {
			targetId.value = '';
			dropRect = null;
			return;
		}
		targetId.value = id;
		dropRect = hovered!.getBoundingClientRect();
	}

	async function onPointerUp(event: PointerEvent) {
		if (pointerId === -1 || event.pointerId !== pointerId) {
			return;
		}
		pointerId = -1;
		if (state.phase === 'idle') {
			return;
		}
		const target = targetId.value;
		const rect = dropRect;
		if (!target || !rect) {
			cancel();
			return;
		}
		flyTo(rect, 'drop');
		// 动画与请求并行：请求通常比 260ms 短，等两者都结束再收尾，
		// 否则浮层会在飞入途中被状态重置直接抹掉。
		await Promise.all([
			options.onMerge(state.sourceId, target).catch(() => false),
			new Promise<void>((resolve) => setTimeout(resolve, 260)),
		]);
		reset();
	}

	/** 飞向目标或飞回原位。两者共用一套过渡，只是终点与终态不同 */
	function flyTo(rect: DOMRect, phase: DragPhase) {
		state.phase = phase;
		// 尺寸保持不变，只做位移与缩放：改宽高不会参与过渡，会先跳变再飞
		state.x = rect.left + rect.width / 2 - state.width / 2;
		state.y = rect.top + rect.height / 2 - state.height / 2;
		state.scale = phase === 'drop' ? 0.55 : 1;
		state.opacity = phase === 'drop' ? 0 : 1;
		loop.pause();
	}

	function cancel() {
		pointerId = -1;
		// 已进入飞入/飞回阶段时忽略重复取消：Escape 与 pointerup 可能同时触发
		if (state.phase === 'idle' || state.phase === 'drop' || state.phase === 'return') {
			return;
		}
		const source = card?.querySelector('[data-drag-visual]') as HTMLElement | null;
		if (source) {
			flyTo(source.getBoundingClientRect(), 'return');
		}
		// 回位动画结束后统一收尾
		resetTimer = setTimeout(reset, 280);
	}

	function reset() {
		if (resetTimer) {
			clearTimeout(resetTimer);
			resetTimer = void 0;
		}
		if (state.phase === 'idle') {
			return;
		}
		loop.pause();
		card?.classList.remove('is-drag-source');
		card = null;
		info = null;
		pointerId = -1;
		dropRect = null;
		targetId.value = '';
		state.phase = 'idle';
		state.sourceId = '';
		state.imageUrl = '';
		state.title = '';
		state.opacity = 1;
		state.scale = 1;
		document.body.style.userSelect = '';
		document.body.style.cursor = '';
	}

	/** 找到列表所在的滚动容器；el-scrollbar 的滚动发生在内部的 wrap 上 */
	function getScroller() {
		let element: HTMLElement | null = card ?? null;
		while (element) {
			if (element.scrollHeight > element.clientHeight + 2 && element.clientHeight > 0) {
				const overflow = getComputedStyle(element).overflowY;
				if (overflow === 'auto' || overflow === 'scroll') {
					return element;
				}
			}
			element = element.parentElement;
		}
		return null;
	}

	useEventListener(window, 'pointermove', onPointerMove);
	useEventListener(window, 'pointerup', onPointerUp);
	useEventListener(window, 'pointercancel', () => cancel());
	useEventListener(window, 'blur', () => cancel());
	useEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			cancel();
		}
	});
	// 海报是原生 <img>，拖动时会先触发浏览器的图片拖拽，之后 pointermove 全部丢失，
	// 拖拽看起来就像卡住不动。按下期间直接拦截，不依赖各处的 draggable 属性是否写全。
	useEventListener(
		window,
		'dragstart',
		(event) => {
			if (pointerId !== -1) {
				event.preventDefault();
			}
		},
		{ capture: true },
	);
	// 松手后浏览器仍会补发一次 click，落在卡片上就会跳进详情页；拖拽未结束时拦掉它
	useEventListener(
		window,
		'click',
		(event) => {
			if (state.phase === 'idle') {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
		},
		{ capture: true },
	);

	// 拖拽中被路由切走时，作用域销毁要一并还原 body 上临时加的内联样式。
	// 只在自己仍处于拖拽态时还原，避免误清其它模块写入的 body 样式。
	onScopeDispose(() => {
		if (resetTimer) {
			clearTimeout(resetTimer);
			resetTimer = void 0;
		}
		if (state.phase !== 'idle') {
			document.body.style.userSelect = '';
			document.body.style.cursor = '';
		}
	});

	return {
		state,
		targetId,
		begin,
		cancel,
	};
}
