import type { Series } from '@/data/series';
import mitt from 'mitt';

type RefreshEvents = {
	series: Series[];
};

export const refreshEmitter = mitt<RefreshEvents>();
