import type { Fn } from '@wang-yige/utils';
import type { Season as ISeason } from '~types/videos';
import { ref, unref } from 'vue';
import { updateSeasonSort, updateSeasonTitle } from '@/api/season';
import { Episode } from './episode';
import { Common } from './common';

export class Season extends Common implements Omit<ISeason, 'episodes'> {
	protected static cache: Map<string, Season> = new Map();

	private _id: Ref<ISeason['id']> = ref('');
	private _sort: Ref<ISeason['sort']> = ref(0);
	private _path: Ref<ISeason['path']> = ref('');
	private _title: Ref<ISeason['title']> = ref('');
	private _episodes!: Ref<Episode[]>;
	private episodesTrack!: Fn<[]>;
	private episodesUpdate!: Fn<[Episode[]]>;

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

		if (!Season.hasBindCache(season.id)) {
			const { ref, track, update } = Season.createRef<Episode>();
			this.episodesTrack = track;
			this.episodesUpdate = update;
			this._episodes = ref;
			Season.setBindCache(season.id, { ref, track, update });
		} else {
			const { ref, track, update } = Season.getBindCache<Episode>(season.id)!;
			this._episodes = ref;
			this.episodesTrack = track;
			this.episodesUpdate = update;
		}

		Season.cache.set(season.id, this);
	}

	public setEpisodes(episodes: Episode[]) {
		this.episodesUpdate(episodes);
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

	public get title() {
		return unref(this._title);
	}

	public get episodes() {
		this.episodesTrack();
		return unref(this._episodes);
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
