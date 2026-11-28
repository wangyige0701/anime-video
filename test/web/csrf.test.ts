import { describe, expect, it } from 'vitest';
import { isSafeMethod } from '../../web/src/utils/csrf';

/**
 * 只有「是否需要 CSRF 令牌」这一条与页面无关的规则可以在这里测；
 * 令牌本身来自 `document` 里的 meta，读取逻辑由服务端注入的单测与手工验证覆盖。
 */
describe('isSafeMethod', () => {
	it('只读方法不需要令牌', () => {
		expect(isSafeMethod('get')).toBe(true);
		expect(isSafeMethod('HEAD')).toBe(true);
		expect(isSafeMethod('Options')).toBe(true);
	});

	it('写方法需要令牌', () => {
		expect(isSafeMethod('post')).toBe(false);
		expect(isSafeMethod('PUT')).toBe(false);
		expect(isSafeMethod('patch')).toBe(false);
		expect(isSafeMethod('delete')).toBe(false);
	});

	it('缺少方法时按只读处理，无法识别的方法按写操作处理', () => {
		// axios 未显式指定 method 时就是 GET
		expect(isSafeMethod()).toBe(true);
		// 拿不准就带上令牌：多带一次无害，漏带会被服务端拒绝
		expect(isSafeMethod('')).toBe(false);
		expect(isSafeMethod('propfind')).toBe(false);
	});
});
