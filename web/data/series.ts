import type { Series as ISeries } from '~types/videos';
import { Season } from './season';
import { Common } from './common';
import { getSeries } from '~web/src/api/video';

const initialize = useVueStatusRef('loading', 'initialized');

export class Series extends Common implements Omit<ISeries, 'seasons'> {
	protected static cache: Map<string, Series> = new Map();

	public static async initialized() {
		if (initialize.initialized || initialize.loading) {
			return [] as Series[];
		}
		const result = [] as Series[];
		initialize.onLoading();
		try {
			const series = await getSeries();
			initialize.onInitialized();
			for (const seriesItem of series) {
				result.push(new Series(seriesItem));
			}
		} catch (error) {}
		initialize.offLoading();
		return result;
	}

	public static async refresh() {
		initialize.offInitialized();
		return await this.initialized();
	}

	private _id: Ref<ISeries['id']> = ref('');
	private _path: Ref<ISeries['path']> = ref('');
	private _name: Ref<ISeries['name']> = ref('');
	private _title: Ref<ISeries['title']> = ref('');
	private _images: Ref<ISeries['images']> = ref([]);
	private _description: Ref<ISeries['description']> = ref('');
	private _date: Ref<ISeries['date']> = ref([]);
	private _types: Ref<ISeries['types']> = ref([]);
	private _status: Ref<ISeries['status']> = ref(0);
	private _seasons: ShallowRef<Season[]> = shallowRef([]);

	private useStatus = useVueStatusRef('title', 'images', 'description', 'date', 'types', 'status');

	constructor(series: ISeries) {
		if (Series.cache.has(series.id)) {
			return Series.cache.get(series.id)!;
		}

		super();

		this._id.value = series.id;
		this._path.value = series.path;
		this._name.value = series.name;
		this._title.value = series.title;
		this._images.value = series.images;
		this._description.value = series.description;
		this._date.value = series.date;
		this._types.value = series.types;
		this._status.value = series.status;

		Series.cache.set(series.id, this);
	}

	public get id() {
		return this._id.value;
	}

	public get path() {
		return this._path.value;
	}

	public get name() {
		return this._name.value;
	}

	public get title() {
		return this._title.value;
	}

	public get images() {
		return this._images.value;
	}

	public get description() {
		return this._description.value;
	}

	public get date() {
		return this._date.value;
	}

	public get types() {
		return this._types.value;
	}

	public get status() {
		return this._status.value;
	}

	public get seasons() {
		return this._seasons.value;
	}
}
