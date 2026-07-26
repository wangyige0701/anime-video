import type { ScrollbarDirection } from 'element-plus';
import mitt from 'mitt';

type EndReachedEvents = {
	endReached: { direction: ScrollbarDirection };
};

export const endReachedEmitter = mitt<EndReachedEvents>();
