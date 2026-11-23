import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { Common, patchField, type FieldRefs } from '../src/data/common';

interface DemoValue {
	title: string;
	count: number;
}

class Demo extends Common {
	public readonly values: FieldRefs<DemoValue> = {
		title: ref(''),
		count: ref(0),
	};

	public readonly requestStatus = this.createStatus('title', 'count');

	public updateTitle(next: string, commit: () => Promise<unknown>) {
		return patchField(this.values, this.requestStatus, 'title', next, commit);
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
