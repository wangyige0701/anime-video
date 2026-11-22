import type { SeriesDateRange } from '@/utils/seriesQuery';
import type { AxisMonth } from '@/utils/timeAxis';
import { rangeFromIndexes, resolveAxisIndex } from '@/utils/timeAxis';

/** 拖拽划选依赖的可视区布局，由组件按当前缩放窗口计算 */
export interface AxisDragLayout {
	/** 可视区左边界（视口坐标） */
	left: number;
	/** 单月刻度宽度（px），随缩放变化 */
	tickWidth: number;
	/** 可视区左端对应的完整轴下标 */
	start: number;
	/** 可视区包含的月份数量 */
	count: number;
}

export interface AxisDragOptions {
	/** 完整的月份轴 */
	getAxis: () => AxisMonth[];
	/** 读取当前可视区布局，尚未测量到宽度时返回 null */
	getLayout: () => AxisDragLayout | null;
	/** 指针拖出可视区时平移窗口，返回窗口是否真的移动过 */
	onAutoPan: (direction: -1 | 1) => boolean;
	/** 松手后提交最终范围 */
	onCommit: (range: SeriesDateRange) => void;
}

/** 边缘自动平移的最小帧间隔（毫秒），避免一帧跳过太多月份 */
const AUTO_PAN_INTERVAL = 40;

/**
 * 时间轴的指针划选逻辑。
 *
 * 交互约定：
 * - 按下即确定起点，拖动过程中只更新本地预览，不提交过滤；
 * - 松手才提交最终范围，避免拖动过程反复过滤整个列表；
 * - 按下与松手落在同一刻度即为「选中单月」；
 * - 拖到可视区外侧时自动平移窗口，可以连续划选超出当前视野的区间。
 *
 * 指针监听挂到 window 上并配合 `setPointerCapture`：即使拖出时间轴、
 * 甚至拖到浏览器窗口外，也能正确收到移动与松开事件。
 */
export function useTimeAxisSelection(options: AxisDragOptions) {
	const dragging = ref(false);
	/** 起点与终点都使用完整轴下标，窗口平移后无需重新换算 */
	const startIndex = ref(-1);
	const endIndex = ref(-1);

	let lastClientX = 0;
	/** 边缘自动平移的动画帧句柄，0 表示未运行 */
	let frame = 0;
	let lastPanAt = 0;
	/** 捕获指针的元素与指针 ID，松手时释放 */
	let capturedElement: HTMLElement | null = null;
	let capturedPointerId = -1;

	/** 拖动过程中的预览范围，未拖动时为 null */
	const previewRange = computed<SeriesDateRange | null>(() => {
		if (!dragging.value) {
			return null;
		}
		return rangeFromIndexes(options.getAxis(), startIndex.value, endIndex.value);
	});

	/** 把指针横坐标换算为完整轴下标，落在可视区外时收敛到最近的可见刻度 */
	function indexAt(clientX: number) {
		const total = options.getAxis().length;
		const layout = options.getLayout();
		if (total <= 0 || !layout || layout.tickWidth <= 0 || layout.count <= 0) {
			return -1;
		}
		const local = resolveAxisIndex(clientX, layout.left, layout.count, layout.tickWidth);
		return Math.min(Math.max(layout.start + local, 0), total - 1);
	}

	/** 指针越过可视区左右边界时返回平移方向 */
	function panDirection(): -1 | 0 | 1 {
		const layout = options.getLayout();
		if (!layout) {
			return 0;
		}
		const right = layout.left + layout.tickWidth * layout.count;
		if (lastClientX < layout.left) {
			return -1;
		}
		return lastClientX > right ? 1 : 0;
	}

	function stopAutoPan() {
		if (frame) {
			cancelAnimationFrame(frame);
			frame = 0;
		}
	}

	function autoPanFrame(time: number) {
		frame = 0;
		if (!dragging.value) {
			return;
		}
		const direction = panDirection();
		if (!direction) {
			return;
		}
		if (time - lastPanAt < AUTO_PAN_INTERVAL) {
			frame = requestAnimationFrame(autoPanFrame);
			return;
		}
		lastPanAt = time;
		// 已经贴住数据两端时停止平移，避免空转
		if (!options.onAutoPan(direction)) {
			return;
		}
		const index = indexAt(lastClientX);
		if (index >= 0) {
			endIndex.value = index;
		}
		frame = requestAnimationFrame(autoPanFrame);
	}

	/** 指针在可视区外时启动自动平移，在区内时什么都不做 */
	function ensureAutoPan() {
		if (frame || !panDirection()) {
			return;
		}
		lastPanAt = 0;
		frame = requestAnimationFrame(autoPanFrame);
	}

	function removeListeners() {
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
		window.removeEventListener('pointercancel', onPointerCancel);
		if (capturedElement && capturedPointerId >= 0) {
			// 元素可能已卸载，释放失败不影响主流程
			capturedElement.releasePointerCapture?.(capturedPointerId);
		}
		capturedElement = null;
		capturedPointerId = -1;
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging.value) {
			return;
		}
		lastClientX = event.clientX;
		const index = indexAt(lastClientX);
		if (index >= 0) {
			endIndex.value = index;
		}
		ensureAutoPan();
	}

	/**
	 * 结束拖动。
	 *
	 * `commit` 为 false 时（指针被系统取消）只清理状态，不提交范围，
	 * 避免把取消的手势当成一次选择。
	 */
	function finish(commit: boolean) {
		if (!dragging.value) {
			return;
		}
		const range = rangeFromIndexes(options.getAxis(), startIndex.value, endIndex.value);
		dragging.value = false;
		stopAutoPan();
		removeListeners();
		if (commit && range) {
			options.onCommit(range);
		}
	}

	function onPointerUp() {
		finish(true);
	}

	function onPointerCancel() {
		finish(false);
	}

	function onPointerDown(event: PointerEvent) {
		// 只响应鼠标左键/单指触摸，右键与多指手势留给浏览器默认行为
		if (event.button !== 0 || dragging.value) {
			return;
		}
		const index = indexAt(event.clientX);
		if (index < 0) {
			return;
		}
		// 阻止文本选择与原生拖拽，否则浏览器会接管后续的指针移动
		event.preventDefault();
		const target = event.currentTarget;
		if (target instanceof HTMLElement && typeof target.setPointerCapture === 'function') {
			target.setPointerCapture(event.pointerId);
			capturedElement = target;
			capturedPointerId = event.pointerId;
		}
		dragging.value = true;
		startIndex.value = index;
		endIndex.value = index;
		lastClientX = event.clientX;
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', onPointerCancel);
	}

	// 作用域销毁时移除全局监听并停掉动画帧，避免组件卸载后仍持有回调
	onScopeDispose(() => {
		dragging.value = false;
		stopAutoPan();
		removeListeners();
	});

	return { dragging, previewRange, onPointerDown };
}
