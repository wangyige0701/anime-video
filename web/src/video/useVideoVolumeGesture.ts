import { onScopeDispose, toValue, type MaybeRefOrGetter } from 'vue';

type ElementTarget = MaybeRefOrGetter<HTMLElement | null | undefined>;

interface VideoVolumeGestureOptions {
	excludedTarget: ElementTarget;
	increase: () => void;
	decrease: () => void;
	touchThreshold?: number;
}

const DEFAULT_TOUCH_THRESHOLD = 24;

export function useVideoVolumeGesture(options: VideoVolumeGestureOptions) {
	let volumeTouch: { identifier: number; startY: number; currentY: number } | null = null;

	function handleWheel(event: WheelEvent) {
		if (isExcludedEvent(event) || event.deltaY === 0) {
			return;
		}
		event.preventDefault();
		if (event.deltaY < 0) {
			options.increase();
		} else {
			options.decrease();
		}
	}

	function handleTouchStart(event: TouchEvent) {
		if (isExcludedEvent(event) || event.touches.length !== 1) {
			resetTouch();
			return;
		}
		const touch = event.touches.item(0);
		if (!touch) {
			return;
		}
		volumeTouch = { identifier: touch.identifier, startY: touch.clientY, currentY: touch.clientY };
	}

	function handleTouchMove(event: TouchEvent) {
		if (!volumeTouch) {
			return;
		}
		const touch = findTouch(event.touches, volumeTouch.identifier);
		if (!touch) {
			resetTouch();
			return;
		}
		event.preventDefault();
		volumeTouch.currentY = touch.clientY;
	}

	function handleTouchEnd(event: TouchEvent) {
		if (!volumeTouch) {
			return;
		}
		const touch = findTouch(event.changedTouches, volumeTouch.identifier);
		if (touch) {
			volumeTouch.currentY = touch.clientY;
		}
		const distance = volumeTouch.startY - volumeTouch.currentY;
		resetTouch();
		if (Math.abs(distance) < (options.touchThreshold ?? DEFAULT_TOUCH_THRESHOLD)) {
			return;
		}
		event.preventDefault();
		if (distance > 0) {
			options.increase();
		} else {
			options.decrease();
		}
	}

	function resetTouch() {
		volumeTouch = null;
	}

	function isExcludedEvent(event: Event) {
		const excludedTarget = toValue(options.excludedTarget);
		return event.target instanceof Node && Boolean(excludedTarget?.contains(event.target));
	}

	onScopeDispose(resetTouch);

	return {
		handleWheel,
		handleTouchStart,
		handleTouchMove,
		handleTouchEnd,
		resetTouch,
	};
}

function findTouch(touches: TouchList, identifier: number) {
	for (let index = 0; index < touches.length; index += 1) {
		const touch = touches.item(index);
		if (touch?.identifier === identifier) {
			return touch;
		}
	}
	return null;
}
