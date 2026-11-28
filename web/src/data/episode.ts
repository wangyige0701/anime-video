import type { Episode as IEpisode } from '~types/videos';
import type { EpisodeKind } from '~shared/episode-kind';
import { isEpisodeKind } from '~shared/episode-kind';
import { ref } from 'vue';
import { Common, patchField, serverTitle, type FieldRefs } from './common';
import { updateEpisodeKind, updateEpisodeSort, updateEpisodeTitle } from '@/api/episode';

export class Episode extends Common implements IEpisode {
	protected static cache: Map<string, Episode> = new Map();

	private values: FieldRefs<IEpisode> = {
		id: ref(''),
		sort: ref(0),
		path: ref(''),
		extension: ref(''),
		title: ref(''),
		kind: ref<EpisodeKind>('main'),
	};

	private requestStatus = this.createStatus('title', 'sort', 'kind');

	constructor(episode: IEpisode) {
		if (Episode.cache.has(episode.id)) {
			return Episode.cache.get(episode.id)!;
		}

		super();

		for (const key of Object.keys(this.values) as Array<keyof IEpisode>) {
			(this.values[key] as Ref<unknown>).value = episode[key];
		}
		// 历史数据没有 kind，按正片兜底，避免界面出现空白标记
		this.values.kind.value = isEpisodeKind(episode.kind) ? episode.kind : 'main';

		Episode.cache.set(episode.id, this);
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

	public get extension() {
		return this.values.extension.value;
	}

	public get title() {
		return this.values.title.value;
	}

	public get kind() {
		return this.values.kind.value;
	}
	// endregion

	// region 属性更新时的响应式状态
	public get titleRef() {
		return this.requestStatus.get('title');
	}

	public get sortRef() {
		return this.requestStatus.get('sort');
	}

	public get kindRef() {
		return this.requestStatus.get('kind');
	}
	// endregion

	// region 更新标题
	/** 标题允许为空：服务端会还原为默认标题，并用返回值纠正本地值 */
	public async updateTitle(title: string) {
		const next = title.trim();
		await patchField(
			this.values,
			this.requestStatus,
			'title',
			next,
			() => updateEpisodeTitle(this.id, next),
			serverTitle,
		);
	}
	// endregion

	// region 更新排序
	/**
	 * 更新服务端排序值。
	 *
	 * @returns 请求是否成功；失败时已回滚本地 sort，调用方可据此恢复列表顺序
	 */
	public async updateSort(sort: number) {
		return await patchField(this.values, this.requestStatus, 'sort', sort, () => updateEpisodeSort(this.id, sort));
	}

	/**
	 * 仅同步本地 sort，不发起请求。
	 *
	 * 拖拽排序时服务端会把区间内其它集 ±1 平移，客户端据此对齐本地字段，
	 * 避免界面上显示的序号与实体 sort 长期不一致。
	 */
	public syncSort(sort: number) {
		this.values.sort.value = sort;
	}
	// endregion

	// region 更新集类型
	/** 切换正片 / 特别篇；只影响标注，不改变集在季内的顺序 */
	public async updateKind(kind: EpisodeKind) {
		return await patchField(
			this.values,
			this.requestStatus,
			'kind',
			kind,
			() => updateEpisodeKind(this.id, kind),
			(result) => (isEpisodeKind(result) ? result : void 0),
		);
	}
	// endregion
}
