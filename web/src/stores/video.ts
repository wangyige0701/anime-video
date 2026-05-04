import { createPromise, hasOwn, isObject, isString } from '@wang-yige/utils';
import { defineStore } from 'pinia';
import { ref, shallowReactive } from 'vue';
import type { Series } from '~types/videos';

export const useVideoStore = defineStore('video', () => {
	let isWaiting = ref(true);
	const { promise, resolve } = createPromise<void>();
	const data = shallowReactive<Series[]>([]);

	async function getData() {
		await promise;
		return data;
	}

	async function setData(newData: Series[]) {
		(await getData()).splice(0, data.length, ...newData);
	}

	async function getSeriesInfo(seriesId: string) {
		if (!isString(seriesId) || !seriesId) {
			return;
		}
		return (await getData()).find((item) => item.id === seriesId);
	}

	async function updateData<T extends keyof Omit<Series, 'id'>>(
		seriesId: string,
		key: T,
		value: Series[T],
	): Promise<void>;
	async function updateData(seriesId: string, series: Omit<Series, 'id'>): Promise<void>;
	async function updateData(...params: any[]) {
		const seriesId = params[0] as string;
		if (!isString(seriesId) || !seriesId) {
			return;
		}
		let series = params[1] as Series | keyof Series;
		if (isString(series)) {
			// 参数归一化
			const key = series;
			const value = params[2] as any;
			series = {
				[key]: value,
			} as Series;
		}
		if (!isObject(series)) {
			return;
		}
		const target = (await getData()).find((item) => item.id === seriesId);
		if (!target) {
			return;
		}
		for (const key in series) {
			if (hasOwn(target, key)) {
				target[key as keyof Series] = series[key as keyof Series] as any;
			}
		}
	}

	function initialize() {
		isWaiting.value = false;
		resolve();
	}

	return {
		data,
		isWaiting,
		getSeriesInfo,
		getData,
		setData,
		updateData,
		initialize,
	};
});
