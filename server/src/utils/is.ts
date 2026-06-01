import { isArray, isObject } from '@wang-yige/utils';

/**
 * 针对对象和数组递归判断是否相同，其他类型直接判断是否相等
 */
export function isEqual(oldValue: any, newValue: any): boolean {
	if (isObject(oldValue) && isObject(newValue)) {
		const oldKeys = Object.keys(oldValue);
		const newKeys = Object.keys(newValue);
		if (oldKeys.length !== newKeys.length) {
			return false;
		}
		for (const key of oldKeys) {
			if (!newKeys.includes(key)) {
				return false;
			}
			if (!isEqual(oldValue[key], newValue[key])) {
				return false;
			}
		}
		return true;
	}
	if (isArray(oldValue) && isArray(newValue)) {
		if (oldValue.length !== newValue.length) {
			return false;
		}
		for (let i = 0; i < oldValue.length; i++) {
			if (!isEqual(oldValue[i], newValue[i])) {
				return false;
			}
		}
		return true;
	}
	return oldValue === newValue;
}
