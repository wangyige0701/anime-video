import { describe, expect, it } from 'vitest';
import { getPlainErrorMessage } from '../../web/src/utils/apiError';

/** 构造一个带响应体的错误对象，形状与 axios 的 AxiosError 一致 */
function errorWith(data: unknown, contentType?: string) {
	return { response: { data, headers: contentType ? { 'content-type': contentType } : {} } };
}

describe('getPlainErrorMessage', () => {
	it('Should return the plain text body of a business error', () => {
		const error = errorWith('不能将系列合并到自身', 'text/plain; charset=utf-8');
		expect(getPlainErrorMessage(error)).toBe('不能将系列合并到自身');
	});

	it('Should trim surrounding whitespace of the body', () => {
		expect(getPlainErrorMessage(errorWith('  该系列不在此合并组中 \n', 'text/plain'))).toBe('该系列不在此合并组中');
	});

	it('Should ignore JSON bodies', () => {
		const error = errorWith({ code: 400, message: '参数错误' }, 'application/json; charset=utf-8');
		expect(getPlainErrorMessage(error)).toBe('');
	});

	it('Should ignore a plain text body served with a non text content type', () => {
		expect(getPlainErrorMessage(errorWith('Method Not Allowed', 'text/html'))).toBe('');
	});

	it('Should ignore a response without a content type', () => {
		expect(getPlainErrorMessage(errorWith('不能将系列合并到自身'))).toBe('');
	});

	it('Should ignore a non string body', () => {
		expect(getPlainErrorMessage(errorWith(['a'], 'text/plain'))).toBe('');
	});

	it('Should ignore an empty body', () => {
		expect(getPlainErrorMessage(errorWith('   ', 'text/plain'))).toBe('');
	});

	it('Should ignore network errors that carry no response', () => {
		expect(getPlainErrorMessage(new Error('Network Error'))).toBe('');
	});

	it('Should ignore null and primitive inputs', () => {
		expect(getPlainErrorMessage(null)).toBe('');
		expect(getPlainErrorMessage(undefined)).toBe('');
		expect(getPlainErrorMessage('boom')).toBe('');
	});
});
