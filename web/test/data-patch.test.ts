import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { Common, patchField, serverTitle, type FieldRefs } from '../src/data/common';

interface DemoValue {
	title: string;
	count: number;
	tags: string[];
}

class Demo extends Common {
	public readonly values: FieldRefs<DemoValue> = {
		title: ref(''),
		count: ref(0),
		tags: ref<string[]>([]),
	};

	public readonly requestStatus = this.createStatus('title', 'count', 'tags');

	public updateTitle(next: string, commit: () => Promise<unknown>, settle?: (result: unknown) => unknown) {
		return patchField(this.values, this.requestStatus, 'title', next, commit, settle);
	}

	public updateTags(next: string[], commit: () => Promise<unknown>) {
		return patchField(this.values, this.requestStatus, 'tags', next, commit);
	}
}

function createDemo() {
	const demo = new Demo();
	demo.values.title.value = '旧标题';
	return demo;
}

describe('patchField 乐观更新', () => {
	it('请求前写入本地值，请求期间打开对应字段状态', async () => {
		const demo = createDemo();
		let during = false;
		const success = await demo.updateTitle('新标题', async () => {
			during = demo.requestStatus.get('title') && demo.values.title.value === '新标题';
		});
		expect(success).toBe(true);
		expect(during).toBe(true);
		expect(demo.values.title.value).toBe('新标题');
		expect(demo.requestStatus.get('title')).toBe(false);
	});

	it('请求失败时回滚本地值并关闭状态', async () => {
		const demo = createDemo();
		const success = await demo.updateTitle('新标题', async () => {
			throw new Error('请求失败');
		});
		expect(success).toBe(false);
		expect(demo.values.title.value).toBe('旧标题');
		expect(demo.requestStatus.get('title')).toBe(false);
	});

	it('字段状态互不影响', async () => {
		const demo = createDemo();
		await demo.updateTitle('新标题', async () => {
			expect(demo.requestStatus.get('count')).toBe(false);
		});
	});

	it('状态控制器透传异步任务的返回值', async () => {
		const demo = createDemo();
		expect(await demo.requestStatus.run('count', async () => 42)).toBe(42);
		expect(demo.requestStatus.get('count')).toBe(false);
	});
});

describe('并发编辑与数组字段', () => {
	it('同一字段前一次请求失败时，不回滚后一次已写入的值', async () => {
		const demo = createDemo();
		let rejectFirst!: (error: Error) => void;
		const first = demo.updateTitle(
			'第一次',
			() =>
				new Promise((_resolve, reject) => {
					rejectFirst = reject;
				}),
		);
		const second = demo.updateTitle('第二次', async () => undefined);
		// 前一次请求被取消（如 axios 的 Single.PREV），此时本地已是「第二次」。
		rejectFirst(new Error('请求被取消'));
		expect(await first).toBe(false);
		expect(await second).toBe(true);
		expect(demo.values.title.value).toBe('第二次');
	});

	it('数组字段失败回滚、成功保留，响应式代理不会影响判断', async () => {
		const demo = createDemo();
		demo.values.tags.value = ['a'];
		const failed = await demo.updateTags(['a', 'b'], async () => {
			throw new Error('请求失败');
		});
		expect(failed).toBe(false);
		expect(demo.values.tags.value).toEqual(['a']);

		const success = await demo.updateTags(['a', 'b'], async () => undefined);
		expect(success).toBe(true);
		expect(demo.values.tags.value).toEqual(['a', 'b']);
	});
});

describe('标题空值回落', () => {
	it('服务端返回默认标题时覆盖本地乐观值', async () => {
		const demo = createDemo();
		const success = await demo.updateTitle('', async () => '默认标题', serverTitle);
		expect(success).toBe(true);
		expect(demo.values.title.value).toBe('默认标题');
		expect(demo.requestStatus.get('title')).toBe(false);
	});

	it('服务端未返回标题时保留乐观写入的值', async () => {
		const demo = createDemo();
		await demo.updateTitle('新标题', async () => null, serverTitle);
		expect(demo.values.title.value).toBe('新标题');
	});

	it('请求失败时仍然回滚，不采用返回值', async () => {
		const demo = createDemo();
		const success = await demo.updateTitle(
			'',
			async () => {
				throw new Error('请求失败');
			},
			serverTitle,
		);
		expect(success).toBe(false);
		expect(demo.values.title.value).toBe('旧标题');
	});

	it('serverTitle 只接受非空字符串', () => {
		expect(serverTitle('默认标题')).toBe('默认标题');
		expect(serverTitle('')).toBeUndefined();
		expect(serverTitle(null)).toBeUndefined();
		expect(serverTitle(123)).toBeUndefined();
	});
});
