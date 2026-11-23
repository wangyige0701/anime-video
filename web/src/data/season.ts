import type { Season as ISeason } from '~types/videos';
import type { Fn } from '@wang-yige/utils';
import { ref, unref } from 'vue';
import { Common, patchField, type FieldRefs } from './common';
import { updateSeasonSort, updateSeasonTitle } from '@/api/season';
import { Episode } from './episode';

type SeasonValue = Omit<ISeason, 'episodes'>;

export class Season extends Common implements SeasonValue {
	protected static cache: Map<string, Season> = new Map();

	private values: FieldRefs<SeasonValue> = {
		id: ref(''),
		sort: ref(0),
		path: ref(''),
		title: ref(''),
	};

	private requestStatus = this.createStatus('title', 'sort');

	private _episodes!: Ref<Episode[]>;
	private episodesTrack!: Fn<[]>;
	private episodesUpdate!: Fn<[Episode[]]>;

	constructor(season: ISeason) {
		if (Season.cache.has(season.id)) {
			return Season.cache.get(season.id)!;
		}

		super();

		for (const key of Object.keys(this.values) as Array<keyof SeasonValue>) {
			(this.values[key] as Ref<unknown>).value = season[key];
		}

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
		return this.values.id.value;
	}

	public get sort() {
		return this.values.sort.value;
	}

	public get path() {
		return this.values.path.value;
	}

	public get title() {
		return this.values.title.value;
	}

	public get episodes() {
		this.episodesTrack();
		return unref(this._episodes);
	}
	// endregion

	// region 属性更新时的响应式状态
	public get titleRef() {
		return this.requestStatus.get('title');
	}

	public get sortRef() {
		return this.requestStatus.get('sort');
	}
	// endregion

	// region 更新标题
	public async updateTitle(title: string) {
		await patchField(this.values, this.requestStatus, 'title', title, () => updateSeasonTitle(this.id, title));
	}
	// endregion

	// region 更新排序
	/**
	 * 更新服务端排序值。
	 *
	 * @returns 请求是否成功；失败时已回滚本地 sort，调用方可据此恢复列表顺序
	 */
	public async updateSort(sort: number) {
		return await patchField(this.values, this.requestStatus, 'sort', sort, () => updateSeasonSort(this.id, sort));
	}

	/**
	 * 仅同步本地 sort，不发起请求。
	 *
	 * 拖拽排序时服务端会把区间内其它季 ±1 平移，客户端据此对齐本地字段，
	 * 避免排序字段与界面顺序长期不一致。
	 */
	public syncSort(sort: number) {
		this.values.sort.value = sort;
	}
	// endregion
}
