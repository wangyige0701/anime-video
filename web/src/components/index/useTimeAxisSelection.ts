import type { SeriesDateRange } from '@/utils/seriesQuery';
import type { AxisMonth } from '@/utils/timeAxis';
import { rangeFromIndexes, resolveAxisIndex } from '@/utils/timeAxis';

/**
 * 时间轴的指针划选逻辑。
 *
 * 交互约定：
 * - 按下即确定起点，拖动过程中只更新本地预览，不提交过滤；
 * - 松手才提交最终范围，避免拖动过程反复过滤整个列表；
 * - 按下与松手落在同一刻度即为「选中单月」。
 *
 * 指针监听挂到 window 上，保证拖出时间轴范围后仍能正确结束与提交。
 */
export function useTimeAxisSelection(getAxis: () => AxisMonth[], onCommit: (range: SeriesDateRange | null) => void) {
	/** 内容容器引用，宽度为全部刻度的总和，随横向滚动一起偏移 */
	const contentRef = useTemplateRef<HTMLElement>('content');
	const dragging = ref(false);
	const startIndex = ref(-1);
	const endIndex = ref(-1);

	/** 拖动过程中的预览范围，未拖动时为 null */
	const previewRange = computed<SeriesDateRange | null>(() => {
		if (!dragging.value) {
			return null;
		}
		return rangeFromIndexes(getAxis(), startIndex.value, endIndex.value);
	});

	/** 把指针横坐标换算为刻度下标 */
	function indexAt(clientX: number) {
		const element = contentRef.value;
		if (!element) {
			return -1;
		}
		// 必须使用内容容器的左边界：外层滚动容器固定，滚动后用它换算会整体偏移
		return resolveAxisIndex(clientX, element.getBoundingClientRect().left, getAxis().length);
	}

	function removeListeners() {
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
		window.removeEventListener('pointercancel', onPointerUp);
	}

	function onPointerMove(event: PointerEvent) {
		const index = indexAt(event.clientX);
		if (index >= 0) {
			endIndex.value = index;
		}
	}

	function onPointerUp() {
		if (!dragging.value) {
			return;
		}
		const range = rangeFromIndexes(getAxis(), startIndex.value, endIndex.value);
		dragging.value = false;
		removeListeners();
		if (range) {
			onCommit(range);
		}
	}

	function onPointerDown(event: PointerEvent) {
		// 只响应鼠标左键/单指触摸，右键与多指手势留给浏览器默认行为
		if (event.button !== 0) {
			return;
		}
		const index = indexAt(event.clientX);
		if (index < 0) {
			return;
		}
		dragging.value = true;
		startIndex.value = index;
		endIndex.value = index;
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', onPointerUp);
	}

	// 作用域销毁时移除全局监听，避免组件卸载后仍持有回调
	onScopeDispose(removeListeners);

	return { contentRef, dragging, previewRange, onPointerDown };
}
