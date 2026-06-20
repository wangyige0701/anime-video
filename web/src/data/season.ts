import type { Season as ISeason } from '~types/videos';
import { updateSeasonSort, updateSeasonTitle } from '@/api/season';
import { Episode } from './episode';
import { Common } from './common';

export class Season extends Common implements Omit<ISeason, 'episodes'> {
	protected static cache: Map<string, Season> = new Map();

	private _id: Ref<ISeason['id']> = ref('');
	private _sort: Ref<ISeason['sort']> = ref(0);
	private _path: Ref<ISeason['path']> = ref('');
	private _title: Ref<ISeason['title']> = ref('');
	private _episodes: Ref<Episode[]> = ref([]);

	private useStatus = useVueStatusRef('title', 'sort');

	constructor(season: ISeason) {
		if (Season.cache.has(season.id)) {
			return Season.cache.get(season.id)!;
		}

		super();

		this._id.value = season.id;
		this._sort.value = season.sort;
		this._path.value = season.path;
		this._title.value = season.title;

		Season.cache.set(season.id, this);
	}

	public setEpisodes(episodes: Episode[]) {
		this._episodes.value = episodes;
	}

	// region 属性访问器
	public get id() {
		return this._id.value;
	}

	public get sort() {
		return this._sort.value;
	}

	public get path() {
		return this._path.value;
	}

	public get title() {
		return this._title.value;
	}

	public get episodes() {
		return this._episodes.value;
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
			await updateSeasonTitle(this.id, title);
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
			await updateSeasonSort(this.id, sort);
		} catch (error) {
			this._sort.value = oldValue;
		}
		this.useStatus.offSort();
	}
	// endregion
}
