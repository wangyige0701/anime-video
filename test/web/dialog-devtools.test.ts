import { describe, expect, it } from 'vitest';
import { removeDevtoolsApp } from '../../web/src/utils/dialog/devtools';

/**
 * Devtools 缓冲区不清理，每开一次对话框就会留下一条抓着组件树的记录，
 * 反复开关后内存只涨不降。这里只测「摘记录」这一层，window 上的读取由调用方负责。
 */
describe('removeDevtoolsApp', () => {
	const app = { name: 'dialog-app' };

	it('支持 [descriptor] 形式的条目', () => {
		const buffer = [[{ app: { name: 'other' } }], [{ app }]];
		expect(removeDevtoolsApp(buffer, app)).toBe(true);
		expect(buffer).toHaveLength(1);
		expect(buffer[0][0].app).toEqual({ name: 'other' });
	});

	it('支持直接存放 descriptor 的条目', () => {
		const buffer = [{ app }, { app: { name: 'other' } }];
		expect(removeDevtoolsApp(buffer, app)).toBe(true);
		expect(buffer).toHaveLength(1);
	});

	it('找不到对应应用时不动缓冲区', () => {
		const buffer = [[{ app: { name: 'other' } }]];
		expect(removeDevtoolsApp(buffer, app)).toBe(false);
		expect(buffer).toHaveLength(1);
	});

	it('没有安装 Devtools 时缓冲区不存在', () => {
		expect(removeDevtoolsApp(undefined, app)).toBe(false);
		expect(removeDevtoolsApp(null, app)).toBe(false);
	});

	it('条目里没有 descriptor 时跳过而不是抛错', () => {
		const buffer: unknown[] = [[], [undefined]];
		expect(removeDevtoolsApp(buffer, app)).toBe(false);
		expect(buffer).toHaveLength(2);
	});
});
