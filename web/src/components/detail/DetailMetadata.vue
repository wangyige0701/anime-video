<template>
	<div class="detail-metadata">
		<div class="types item">
			<div class="title">类型</div>
			<DetailTypes />
		</div>
		<div class="status item">
			<div class="title">状态</div>
			<DetailStatus />
		</div>
		<div class="date item">
			<div class="title">上线时间</div>
			<DetailDate />
		</div>
	</div>
</template>

<script setup lang="ts"></script>

<style scoped lang="scss">
@use 'sass:map';
@use '@/scss/token.scss' as token;

.detail-metadata {
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	width: 100%;
	min-height: 45px;
	border: 1px solid map.get(token.$theme, 'l-2');
	background-color: map.get(token.$theme, 'detail-metadata-bg');
	border-radius: 10px;
	.item {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-height: 100%;
		flex: 1;
		overflow: hidden;
		position: relative;
		padding: 10px 20px;
		&:not(:last-child) {
			&::after {
				content: '';
				display: inline-block;
				width: 1px;
				height: 60%;
				background-color: map.get(token.$theme, 'l-2');
				position: absolute;
				top: 50%;
				right: 0;
				transform: translate(-50%, -50%);
			}
		}
		.title {
			color: map.get(token.$theme, 'l-8');
			font-size: 0.75rem;
		}
	}
}
</style>
