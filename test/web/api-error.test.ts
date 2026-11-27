import { describe, expect, it } from 'vitest';
import { getApiErrorMessage, getPlainErrorMessage } from '../../web/src/utils/apiError';

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

describe('getApiErrorMessage', () => {
	it('Should prefer the business message from a plain text body', () => {
		const error = errorWith('该系列不在此合并组中', 'text/plain; charset=utf-8');
		expect(getApiErrorMessage(error)).toBe('该系列不在此合并组中');
	});

	it('Should translate a browser network failure instead of leaking axios wording', () => {
		expect(getApiErrorMessage({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe(
			'无法连接服务端，请确认服务端已启动后重试',
		);
	});

	it('Should translate connection reset and refused errors', () => {
		expect(getApiErrorMessage({ code: 'ERR_CONNECTION_RESET', message: 'Network Error' })).toContain(
			'无法连接服务端',
		);
		expect(getApiErrorMessage({ code: 'ERR_CONNECTION_REFUSED', message: 'Network Error' })).toContain(
			'无法连接服务端',
		);
	});

	it('Should translate aborted and timed out requests', () => {
		expect(getApiErrorMessage({ code: 'ECONNABORTED', message: 'timeout of 0ms exceeded' })).toContain('请求超时');
		expect(getApiErrorMessage({ code: 'ETIMEDOUT', message: 'timeout' })).toContain('请求超时');
	});

	it('Should stay silent on a canceled request', () => {
		expect(getApiErrorMessage({ code: 'ERR_CANCELED', message: 'canceled' })).toBe('');
	});

	it('Should fall back to the status code when no readable body exists', () => {
		const error = { response: { status: 500, data: 'Internal Server Error', headers: {} } };
		expect(getApiErrorMessage(error)).toBe('请求失败（HTTP 500），请稍后重试');
	});

	it('Should never return an English axios message', () => {
		const cases = [
			{ code: 'ERR_NETWORK', message: 'Network Error' },
			{ response: { status: 502, data: '', headers: {} }, message: 'Request failed with status code 502' },
			{ message: 'something odd' },
			new Error('Network Error'),
		];
		for (const error of cases) {
			expect(getApiErrorMessage(error)).not.toMatch(/request failed|network error|timeout of/i);
		}
	});
});
