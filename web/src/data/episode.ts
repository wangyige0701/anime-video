import type { Episode as IEpisode } from '~types/videos';
import { Common } from './common';
import { updateEpisodeSort, updateEpisodeTitle } from '@/api/episode';

export class Episode extends Common implements IEpisode {
	protected static cache: Map<string, Episode> = new Map();

	private _id: Ref<IEpisode['id']> = ref('');
	private _sort: Ref<IEpisode['sort']> = ref(0);
	private _path: Ref<IEpisode['path']> = ref('');
	private _extension: Ref<IEpisode['extension']> = ref('');
	private _title: Ref<IEpisode['title']> = ref('');

	private useStatus = useVueStatusRef('title', 'sort');

	constructor(episode: IEpisode) {
		if (Episode.cache.has(episode.id)) {
			return Episode.cache.get(episode.id)!;
		}

		super();

		this._id.value = episode.id;
		this._sort.value = episode.sort;
		this._path.value = episode.path;
		this._extension.value = episode.extension;
		this._title.value = episode.title;

		Episode.cache.set(episode.id, this);
	}

	// region 属性访问器

	public get id() {
		return unref(this._id);
	}

	public get sort() {
		return unref(this._sort);
	}

	public get path() {
		return unref(this._path);
	}

	public get extension() {
		return unref(this._extension);
	}

	public get title() {
		return unref(this._title);
	}
	// endregion

	// region 属性更新时的响应式状态
	public get titleRef() {
		return this.useStatus.title;
	}

	public get sortRef() {
		return this.useStatus.sort;
	}
	// endregion

	// region 更新标题
	public async updateTitle(title: string) {
		const oldValue = this._title.value;
		this._title.value = title;
		this.useStatus.onTitle();
		try {
			await updateEpisodeTitle(this.id, title);
		} catch (error) {
			this._title.value = oldValue;
		}
		this.useStatus.offTitle();
	}
	// endregion

	// region 更新排序
	public async updateSort(sort: number) {
		const oldValue = this._sort.value;
		this._sort.value = sort;
		this.useStatus.onSort();
		try {
			await updateEpisodeSort(this.id, sort);
		} catch (error) {
			this._sort.value = oldValue;
		}
		this.useStatus.offSort();
	}
	// endregion
}
