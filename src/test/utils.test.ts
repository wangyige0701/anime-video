import { describe, it, expect } from 'vitest';
import { parsePath } from '../utils/parsePath';

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
});
