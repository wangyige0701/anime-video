import type { BangumiMatchResult, BangumiMatchSeason, BangumiPreviewResult } from '@/@types/bangumi-sync';
import type {
	BangumiCurrentSnapshot,
	BangumiPreviewDiff,
	BangumiSelection,
	BangumiSeriesSelection,
} from '@/utils/bangumiSync';
import { computed, ref } from 'vue';
import { useVueStatusRef } from 'status-ref/vue';
import { getSeriesStatusName } from '~shared/series-status';
import { getSeriesTypeName } from '~shared/series-types';
import { applyBangumi, matchBangumi, previewBangumi } from '@/api/bangumi';
import {
	buildApplyInput,
	buildSeasonMapping,
	createSelection,
	describeSelectionSummary,
	describeSyncFooter,
	diffPreview,
	summarizeSelection,
} from '@/utils/bangumiSync';

/** 对话框传进来的入参：系列 id 与打开时的本地快照 */
export interface BangumiSyncInput {
	seriesId: string;
	snapshot: BangumiCurrentSnapshot;
}

/** 系列字段一行：当前值、预览值以及两者是否一致 */
export interface BangumiSeriesField {
	key: keyof BangumiSeriesSelection;
	label: string;
	from: string;
	to: string;
	same: boolean;
}

/** 提示列表最多显示的条数，超出部分只提示数量，避免日志占满对话框 */
const NOTE_LIMIT = 6;

function emptySelection(): BangumiSelection {
	return {
		series: { title: false, description: false, date: false, status: false, types: false },
		seasons: [],
	};
}

/**
 * Bangumi 同步对话框的状态与流程。
 *
 * 三步请求（match → preview → apply）与其派生状态都集中在这里，组件只负责渲染与转发事件：
 * - `match` 结果复制成可编辑镜像，用户改写的条目不能直接落在接口返回值上；
 * - 每次预览都重新对比快照，`diff` 决定哪些项禁用勾选；
 * - `submit()` 只负责发请求并返回写入数量，成功后的关闭与刷新交给调用方，
 *   这样对话框内容不认识详情页，也不认识路由。
 *
 * 对话框每次都重新挂载，所以这里不需要重置逻辑：状态随应用销毁一起释放。
 */
export function useBangumiSync(props: BangumiSyncInput) {
	const status = useVueStatusRef('matching', 'previewing', 'applying');
	/** 0 = 匹配季与条目，1 = 确认变更 */
	const step = ref(0);
	const match = ref<BangumiMatchResult | null>(null);
	const preview = ref<BangumiPreviewResult | null>(null);
	/** 预览与本地数据的逐项对比，用于把「无变化」的项排除在勾选之外 */
	const diff = ref<BangumiPreviewDiff | null>(null);
	/** 匹配结果的本地可编辑镜像，季与条目的对应关系由用户确认 */
	const seasons = ref<BangumiMatchSeason[]>([]);
	const selection = ref<BangumiSelection>(emptySelection());

	/** 任何一步请求进行中都算忙碌：此时关闭对话框会让请求结果无处落地 */
	const busy = computed(() => status.matching || status.previewing || status.applying);
	const candidates = computed(() => match.value?.candidates ?? []);
	const mappedCount = computed(() => seasons.value.filter((season) => season.subjectIds.length).length);
	const applyInput = computed(() => (preview.value ? buildApplyInput(preview.value, selection.value) : {}));
	const summary = computed(() => summarizeSelection(applyInput.value));
	const summaryText = computed(() => describeSelectionSummary(summary.value));
	const footer = computed(() =>
		describeSyncFooter({
			step: step.value,
			matching: status.matching,
			previewing: status.previewing,
			applying: status.applying,
			mappedCount: mappedCount.value,
			total: summary.value.total,
		}),
	);

	const matchNotes = computed(() => {
		const result = match.value;
		if (!result) {
			return [];
		}
		const notes = [...result.warnings];
		if (result.notes) {
			notes.push(result.notes);
		}
		if (notes.length > NOTE_LIMIT) {
			return [...notes.slice(0, NOTE_LIMIT), `还有 ${notes.length - NOTE_LIMIT} 条提示`];
		}
		return notes;
	});

	/**
	 * 系列字段的「当前 → 改为」。
	 *
	 * 当前值取打开对话框时的快照，预览值取接口结果：两者都来自外部，
	 * 对话框不再注入详情页的响应式系列对象，卸载后也不会有人往已销毁的视图里写数据。
	 */
	const seriesFields = computed<BangumiSeriesField[]>(() => {
		const data = preview.value;
		if (!data) {
			return [];
		}
		const current = props.snapshot.series;
		const same = diff.value?.series;
		return [
			{
				key: 'title',
				label: '标题',
				from: current.title || '空',
				to: data.series.title || '空',
				same: !!same?.title,
			},
			{
				key: 'description',
				label: '剧情简介',
				from: current.description || '空',
				to: data.series.description || '空',
				same: !!same?.description,
			},
			{
				key: 'date',
				label: '上线时间',
				from: formatDate(current.date),
				to: formatDate(data.series.date),
				same: !!same?.date,
			},
			{
				key: 'status',
				label: '状态',
				from: getSeriesStatusName(current.status) || '未设置',
				to: getSeriesStatusName(data.series.status) || '未设置',
				same: !!same?.status,
			},
			{
				key: 'types',
				label: '类型',
				from: formatTypes(current.types),
				to: formatTypes(data.series.types),
				same: !!same?.types,
			},
		];
	});

	/** 系列字段里有几项会被覆盖：分组标题用它说明「其余保持当前值」 */
	const seriesChangedCount = computed(() => seriesFields.value.filter((field) => !field.same).length);

	function formatDate(value?: Array<number | undefined> | null) {
		const year = value?.[0];
		const month = value?.[1];
		if (year && month) {
			return `${year} 年 ${month} 月`;
		}
		return year ? `${year} 年` : '未设置';
	}

	function formatTypes(ids: number[]) {
		return (
			ids
				.map((id) => getSeriesTypeName(id))
				.filter(Boolean)
				.join(' / ') || '未设置'
		);
	}

	async function loadMatch() {
		status.onMatching();
		try {
			const result = await matchBangumi(props.seriesId);
			match.value = result;
			// 复制一份可编辑的镜像：候选条目要能被用户改写，不能直接改接口返回值
			seasons.value = result.seasons.map((season) => ({ ...season, subjectIds: [...season.subjectIds] }));
		} catch {
			// 请求失败的提示由 API 层统一给出；保留对话框，用户可以就地重试
		} finally {
			status.offMatching();
		}
	}

	/** 修改某个季选中的 Bangumi 条目 */
	function setSubjectIds(index: number, subjectIds: number[]) {
		const season = seasons.value[index];
		if (season) {
			season.subjectIds = subjectIds;
		}
	}

	/** 回到匹配步骤，保留已选条目便于微调 */
	function toMatchStep() {
		step.value = 0;
	}

	async function loadPreview() {
		const mapping = buildSeasonMapping(seasons.value);
		if (!mapping.some((item) => item.subjectIds.length)) {
			return;
		}
		status.onPreviewing();
		try {
			const result = await previewBangumi(props.seriesId, mapping);
			const next = diffPreview(result, props.snapshot);
			diff.value = next;
			preview.value = result;
			selection.value = createSelection(result, next);
			step.value = 1;
		} catch {
			// 保持匹配步骤，用户调整条目后可以再次生成预览
		} finally {
			status.offPreviewing();
		}
	}

	/**
	 * 提交勾选的变更。
	 *
	 * @returns 写入项数；没有勾选任何内容或请求失败时为 `null`
	 */
	async function submit(): Promise<number | null> {
		const input = applyInput.value;
		const total = summarizeSelection(input).total;
		if (!total) {
			return null;
		}
		status.onApplying();
		try {
			await applyBangumi(props.seriesId, input);
			return total;
		} catch {
			// 失败保留勾选状态，便于用户调整后重试
			return null;
		} finally {
			status.offApplying();
		}
	}

	function setSeriesField(key: keyof BangumiSeriesSelection, value: boolean) {
		selection.value.series[key] = value;
	}

	function setSeasonTitle(index: number, value: boolean) {
		const picked = selection.value.seasons[index];
		if (picked) {
			picked.title = value;
		}
	}

	function setSeasonOrder(index: number, value: boolean) {
		const picked = selection.value.seasons[index];
		if (picked) {
			picked.order = value;
		}
	}

	function setEpisodeTitle(index: number, episodeId: string, value: boolean) {
		const picked = selection.value.seasons[index];
		if (picked) {
			picked.episodes[episodeId] = value;
		}
	}

	/** 全选/全不选只作用于有变化的集，「与当前一致」的项始终不参与提交 */
	function setAllEpisodes(index: number, checked: boolean) {
		const picked = selection.value.seasons[index];
		const season = preview.value?.seasons[index];
		if (!picked || !season) {
			return;
		}
		const same = diff.value?.seasons[index];
		for (const episode of season.episodes) {
			if (same?.episodes[episode.episodeId]) {
				continue;
			}
			picked.episodes[episode.episodeId] = checked;
		}
	}

	return {
		status,
		step,
		busy,
		seasons,
		candidates,
		matchNotes,
		preview,
		diff,
		selection,
		seriesFields,
		seriesChangedCount,
		summary,
		summaryText,
		mappedCount,
		footer,
		loadMatch,
		setSubjectIds,
		toMatchStep,
		loadPreview,
		submit,
		setSeriesField,
		setSeasonTitle,
		setSeasonOrder,
		setEpisodeTitle,
		setAllEpisodes,
	};
}
