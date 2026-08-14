import { usePlayerStore } from '@/stores/player';
import { useEventListener } from '@vueuse/core';
import type { MaybeRefOrGetter } from 'vue';
import { onScopeDispose, toValue } from 'vue';

type ElementTarget = MaybeRefOrGetter<HTMLElement | null | undefined>;

interface VideoControllerActivityOptions {
	container: ElementTarget;
	controller: ElementTarget;
	persistentTargets?: ElementTarget[];
	activate: () => void;
	hold: () => void;
	deactivate: (immediate?: boolean) => void;
}

export function useVideoControllerActivity(options: VideoControllerActivityOptions) {
	const playerStore = usePlayerStore();
	let draggingTarget: 'volume' | 'timeline' | null = null;

	function holdWhileDragging() {
		if (!draggingTarget) {
			return false;
		}
		options.hold();
		return true;
	}

	function activateTemporarily() {
		if (holdWhileDragging()) {
			return;
		}
		options.activate();
	}

	function handleContainerEnter() {
		activateTemporarily();
	}

	function handleContainerMove(event: MouseEvent) {
		if (isInsidePersistentTarget(event.target)) {
			options.hold();
			return;
		}
		activateTemporarily();
	}

	function handleContainerLeave() {
		if (holdWhileDragging()) {
			return;
		}
		options.deactivate(true);
	}

	function handlePersistentTargetLeave(event: MouseEvent) {
		if (holdWhileDragging()) {
			return;
		}
		if (containsNode(toValue(options.container), event.relatedTarget)) {
			options.activate();
			return;
		}
		options.deactivate(true);
	}

	function handlePointerDown(event: PointerEvent) {
		if (!(event.target instanceof Element)) {
			return;
		}
		const slider = event.target.closest('[data-volume-slider], [data-timeline-slider]');
		if (!slider) {
			return;
		}
		draggingTarget = slider.hasAttribute('data-volume-slider') ? 'volume' : 'timeline';
		if (draggingTarget === 'volume') {
			playerStore.setIsVolumeDragging(true);
		}
		options.hold();
	}

	function handlePointerUp(event: PointerEvent) {
		if (!draggingTarget) {
			return;
		}
		clearDraggingTarget();
		if (!containsPoint(toValue(options.container), event.clientX, event.clientY)) {
			options.deactivate(true);
			return;
		}
		if (isPointInsidePersistentTarget(event.clientX, event.clientY)) {
			options.hold();
			return;
		}
		options.activate();
	}

	function cancelDrag() {
		if (!draggingTarget) {
			return;
		}
		clearDraggingTarget();
		options.deactivate(true);
	}

	function clearDraggingTarget() {
		if (draggingTarget === 'volume') {
			playerStore.setIsVolumeDragging(false);
		}
		draggingTarget = null;
	}

	function isInsidePersistentTarget(target: EventTarget | null) {
		return [options.controller, ...(options.persistentTargets ?? [])].some((element) =>
			containsNode(toValue(element), target),
		);
	}

	function isPointInsidePersistentTarget(clientX: number, clientY: number) {
		return [options.controller, ...(options.persistentTargets ?? [])].some((element) =>
			containsPoint(toValue(element), clientX, clientY),
		);
	}

	useEventListener(options.container, 'mouseenter', handleContainerEnter);
	useEventListener(options.container, 'mousemove', handleContainerMove);
	useEventListener(options.container, 'mouseleave', handleContainerLeave);
	useEventListener(options.container, 'pointerdown', handlePointerDown, { capture: true });
	useEventListener(options.controller, 'mouseenter', options.hold);
	useEventListener(options.controller, 'mousemove', options.hold);
	useEventListener(options.controller, 'mouseleave', handlePersistentTargetLeave);
	for (const target of options.persistentTargets ?? []) {
		useEventListener(target, 'mouseenter', options.hold);
		useEventListener(target, 'mousemove', options.hold);
		useEventListener(target, 'mouseleave', handlePersistentTargetLeave);
	}
	useEventListener(window, 'pointerup', handlePointerUp);
	useEventListener(window, 'pointercancel', cancelDrag);
	useEventListener(window, 'blur', cancelDrag);

	onScopeDispose(() => {
		clearDraggingTarget();
		options.deactivate(true);
	});
}

function containsNode(element: HTMLElement | null | undefined, target: EventTarget | null) {
	return target instanceof Node && Boolean(element?.contains(target));
}

function containsPoint(element: HTMLElement | null | undefined, clientX: number, clientY: number) {
	if (!element) {
		return false;
	}
	const rect = element.getBoundingClientRect();
	return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}
