<template>
	<div class="detail-date">
		<el-popover
			ref="popover"
			placement="bottom-start"
			trigger="click"
			:show-arrow="false"
			popper-class="detail-metadata-popover date-picker-popover"
			transition="popover-dropdown"
			:show-after="0"
			:hide-after="0"
			:disabled="series.dateRef"
			width="auto"
			v-model:visible="visible"
			@hide="updateDate"
		>
			<template #reference>
				<div v-if="isPlaceholder" class="placeholder">选择上线时间</div>
				<div v-else class="date-container" :class="{ hover: visible }">
					<span>{{ date[0] }} / {{ date[1]?.toString().padStart(2, '0') }}</span>
					<el-button v-if="!visible" class="reset" text @click.stop="removeDate" title="重置">
						<el-icon :class="{ loading: status.loading }" size="1.2rem"><RefreshLeft /></el-icon>
					</el-button>
				</div>
			</template>

			<div class="date-selected">
				<el-date-picker-panel class="date-picker" type="month" v-model="bindDate" :default-time="void 0" />
			</div>
		</el-popover>
	</div>
</template>

<script setup lang="ts">
import type { Series } from '@/data/series';
import { DETAIL_SERIES_DATA } from '@/config/symbol';
import { isNumber } from '@wang-yige/utils';
import { RefreshLeft } from '@element-plus/icons-vue';

const popover = useTemplateRef('popover');
const status = useVueStatusRef('loading');
const series = inject<ComputedRef<Series>>(DETAIL_SERIES_DATA)!;
const visible = ref(false);
const date = ref<[number?, number?]>([]);
const isPlaceholder = computed(() => !isNumber(date.value[0]) || !isNumber(date.value[1]));
const bindDate = computed({
	get() {
		return [date.value[0] ?? 0, date.value[1] ?? 0];
	},
	set(newDate: Date) {
		date.value[0] = newDate.getFullYear();
		date.value[1] = newDate.getMonth() + 1;
	},
});

watch(
	() => series.value.date,
	(newDate) => {
		date.value = [...(newDate || [])];
	},
	{ deep: true, immediate: true, flush: 'sync' },
);

async function updateDate() {
	if (series.value.date[0] === date.value[0] && series.value.date[1] === date.value[1]) {
		return;
	}
	if (!isNumber(date.value[0]) || !isNumber(date.value[1])) {
		return;
	}
	popover.value?.hide();
	try {
		await series.value.updateDate(date.value[0], date.value[1]);
	} catch (error) {}
}

async function removeDate() {
	if (!series.value.date[0] && !series.value.date[1]) {
		return;
	}
	status.onLoading();
	try {
		await series.value.removeDate();
	} catch (error) {}
	status.offLoading();
}
</script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;
@use './metadata.scss' as *;

.detail-date {
	@include metadata-item;
	@include metadata-content;
}

.placeholder {
	@include metadata-placeholder;
}

.date-container {
	cursor: pointer;
	display: inline-flex;
	flex-direction: row;
	flex-wrap: nowrap;
	align-items: center;
	font-size: 0.875rem;
	line-height: 1;
	transition: color 0.3s ease;
	&:hover,
	&.hover {
		color: map.get(token.$theme, 'l-5');
	}

	.reset {
		height: auto;
		padding: 0;
		margin-left: 20px;
		color: map.get(token.$theme, 'l-7');
		background-color: transparent;
		&:hover {
			color: map.get(token.$theme, 'l-9');
			background-color: transparent;
		}
		.loading {
			animation: reset-loading 0.5s linear infinite;
		}
		@keyframes reset-loading {
			to {
				transform: rotate(-360deg);
			}
		}
	}
}

.date-picker {
	--el-datepicker-border-color: transparent;
	--el-datepicker-inner-border-color: transparent;
	--el-datepicker-inrange-bg-color: transparent;
	--el-datepicker-inrange-hover-bg-color: transparent;
	--el-datepicker-bg-color: transparent;
	--el-border-color-lighter: transparent;
	--el-datepicker-icon-color: #{map.get(token.$theme, 'l-7')};
	--el-datepicker-text-color: #{map.get(token.$theme, 'l-7')};
	--el-datepicker-hover-text-color: #{map.get(token.$theme, 'l-9')};
	--el-datepicker-active-color: #{token.$text-color-primary};
	:deep(.el-date-picker__header-label) {
		color: map.get(token.$theme, 'l-9');
	}
	:deep(.el-picker-panel__content) {
		.today {
			.el-date-table-cell__text {
				color: var(--el-datepicker-text-color);
				font-weight: normal;
			}
		}
	}
}
</style>
<style lang="scss">
.date-picker-popover {
	padding: 0 !important;
}
</style>
