import { describe, it, expect } from 'vitest';
import { parsePath } from '../utils/parsePath';
import { parseRequest } from '../utils/parseReqest';

describe('utils test', () => {
	it('parse path', () => {
		expect(
			parsePath(
				'https://example.com/path/to/resource?key1=value1&key2=value2',
			),
		).toEqual({
			protocol: 'https:',
			host: 'example.com',
			pathname: '/path/to/resource',
			query: {
				key1: 'value1',
				key2: 'value2',
			},
		});
	});

	it('parse path with port', () => {
		expect(parsePath('http://localhost:8080/api/data?param=value')).toEqual(
			{
				protocol: 'http:',
				host: 'localhost',
				port: '8080',
				pathname: '/api/data',
				query: {
					param: 'value',
				},
			},
		);
	});

	it('parse request path', async () => {
		expect(
			await parseRequest('/api/v1/users/123')
				.match('api', 'v1', 'users', /\d+/)
				.catch(() => false),
		).toEqual(['api', 'v1', 'users', '123']);

		expect(
			await parseRequest('/api/v1/users/abc')
				.match('api', 'v1', 'users', /\d+/)
				.catch(() => false),
		).toBe(false);
	});
});
