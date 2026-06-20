import type { Episode as IEpisode } from '~types/videos';
import { Common } from './common';

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
		return this._id.value;
	}

	public get sort() {
		return this._sort.value;
	}

	public get path() {
		return this._path.value;
	}

	public get extension() {
		return this._extension.value;
	}

	public get title() {
		return this._title.value;
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
}
