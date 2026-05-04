import { hasOwn, isArray, isFunction, isObject, isString, type Fn } from '@wang-yige/utils';
import { defineStore } from 'pinia';
import { onBeforeUnmount } from 'vue';

type Listener = Window | Document | Element | NodeListOf<HTMLElement> | string;

type EventMap<T extends Listener> = T extends Window
	? WindowEventMap
	: T extends Document
		? DocumentEventMap
		: HTMLElementEventMap;

function on<T extends Listener>(
	target: T,
	event: keyof EventMap<T>,
	callback: Fn<[e: Event], any>,
	options?: AddEventListenerOptions | boolean,
) {
	if (isString(target)) {
		target = document.querySelectorAll(target) as T;
		if (!(target as NodeListOf<HTMLElement>).length) {
			return;
		}
	}
	let targetList = target as NodeListOf<HTMLElement> | Array<Window | Document | HTMLElement>;
	if (isObject(target)) {
		targetList = [target] as NodeListOf<HTMLElement> | Array<Window | Document | HTMLElement>;
	}
	const offList = [] as (() => void)[];
	if (!(targetList instanceof NodeList) || isArray(targetList)) {
		targetList.forEach((el) => {
			if (hasOwn(el, 'addEventListener') && isFunction(el.addEventListener)) {
				el.addEventListener(event as string, callback, options);
				offList.push(() => el.removeEventListener(event as string, callback, options));
			}
		});
	}

	const useOff = () => {
		offList.forEach((off) => off());
	};

	onBeforeUnmount(() => {
		useOff();
	});

	return useOff;
}

export const useEventListener = () => {
	return {
		on,
	};
};
