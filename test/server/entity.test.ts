import { describe, expect, it } from 'vitest';
import { Entity, type FieldReaders } from '~server/data/entity';

interface DemoStore {
	id: string;
	title: string;
	tags: string[];
}

interface DemoValue {
	id: string;
	title: string;
	tags: string;
}

class Demo extends Entity<DemoStore, DemoValue> {
	/** 与领域类一致：需要变换的字段写在字段映射里，而不是传给单次 field() 调用 */
	protected readonly readers: FieldReaders<DemoStore, DemoValue> = {
		tags: (store) => store.tags.join(','),
	};

	constructor(private readonly raw: DemoStore) {
		super();
		this.store = Promise.resolve(raw);
	}

	public get id() {
		return this.field('id');
	}

	public get title() {
		return this.field('title');
	}

	public get tags() {
		return this.field('tags');
	}

	public async rename(title: string) {
		await this.write('title', title);
	}

	public async addTag(tag: string) {
		await this.mutate('tags', (tags) => {
			tags.push(tag);
		});
	}

	public read<K extends keyof DemoValue>(keys: readonly K[]) {
		return this.collect(keys);
	}

	public refresh() {
		this.invalidate();
	}

	public getRawTitle() {
		return this.raw.title;
	}

	public patchRawTitle(title: string) {
		this.raw.title = title;
	}
}

function createDemo() {
	return new Demo({ id: 'demo', title: '初始标题', tags: ['a', 'b'] });
}

describe('Entity 字段派生', () => {
	it('同一字段重复读取复用同一个 Promise', () => {
		const demo = createDemo();
		expect(demo.title).toBe(demo.title);
		expect(demo.id).toBe(demo.id);
	});

	it('读取时按字段映射把配置值转换成对外值', async () => {
		const demo = createDemo();
		expect(await demo.tags).toBe('a,b');
	});

	it('collect 同样应用字段映射，DTO 不会拿到原始配置值', async () => {
		const demo = createDemo();
		const value = await demo.read(['id', 'tags']);
		expect(value.tags).toBe('a,b');
		// 原始配置是数组，DTO 必须是映射后的字符串，否则接口会漏出存储结构。
		expect(Array.isArray(value.tags)).toBe(false);
	});

	it('write 后旧 Promise 保留旧值，新读取拿到新值', async () => {
		const demo = createDemo();
		const before = demo.title;
		await demo.rename('新标题');
		expect(await before).toBe('初始标题');
		expect(await demo.title).toBe('新标题');
		expect(demo.title).not.toBe(before);
		expect(demo.getRawTitle()).toBe('新标题');
	});

	it('mutate 原地修改数组并使字段缓存失效', async () => {
		const demo = createDemo();
		expect(await demo.tags).toBe('a,b');
		await demo.addTag('c');
		expect(await demo.tags).toBe('a,b,c');
	});

	it('collect 按传入顺序组装字段并忽略未传入字段', async () => {
		const demo = createDemo();
		const value = await demo.read(['title', 'id']);
		expect(Object.keys(value)).toEqual(['title', 'id']);
		expect(value).toEqual({ title: '初始标题', id: 'demo' });
	});

	it('invalidate 后重新从配置派生字段', async () => {
		const demo = createDemo();
		expect(await demo.title).toBe('初始标题');
		// 配置被外部原地改写时，已缓存的字段不会自动更新。
		demo.patchRawTitle('外部改写');
		expect(await demo.title).toBe('初始标题');
		demo.refresh();
		expect(await demo.title).toBe('外部改写');
	});
});
