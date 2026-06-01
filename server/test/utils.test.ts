import { describe, it, expect } from 'vitest';
import { isEqual } from '~server/src/utils/is';

describe('Utils Test', () => {
	it('Should compare object', () => {
		const obj1 = { a: 1, b: 2 };
		const obj2 = { a: 1, b: 2 };
		const obj3 = { a: 1, b: 3 };
		expect(isEqual(obj1, obj2)).toBe(true);
		expect(isEqual(obj1, obj3)).toBe(false);
	});

	it('Should compare array', () => {
		const arr1 = [1, 2, 3];
		const arr2 = [1, 2, 3];
		const arr3 = [1, 2, 4];
		expect(isEqual(arr1, arr2)).toBe(true);
		expect(isEqual(arr1, arr3)).toBe(false);
	});

	it('Should compare primitive type', () => {
		const str1 = 'hello';
		const str2 = 'hello';
		const str3 = 'world';
		expect(isEqual(str1, str2)).toBe(true);
		expect(isEqual(str1, str3)).toBe(false);

		const num1 = 100;
		const num2 = 100;
		const num3 = 200;
		expect(isEqual(num1, num2)).toBe(true);
		expect(isEqual(num1, num3)).toBe(false);

		const bool1 = true;
		const bool2 = true;
		const bool3 = false;
		expect(isEqual(bool1, bool2)).toBe(true);
		expect(isEqual(bool1, bool3)).toBe(false);
	});

	it('Should compare mix type', () => {
		const mix1 = { a: 1, b: [1, 2, 3], c: true, d: { e: 100 } };
		const mix2 = { a: 1, b: [1, 2, 3], c: true, d: { e: 100 } };
		const mix3 = { a: 1, b: [1, 2, 3], c: true, d: { e: 200 } };
		const mix4 = { a: 1, b: [1, 2, 4], c: true, d: { e: 100 } };

		expect(isEqual(mix1, mix2)).toBe(true);
		expect(isEqual(mix1, mix3)).toBe(false);
		expect(isEqual(mix1, mix4)).toBe(false);
	});
});
