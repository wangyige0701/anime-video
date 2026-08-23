<template>
	<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-label="最后观看">
		<!-- 动态光晕 -->
		<circle class="pulse-ring" cx="12" cy="12" r="9" />

		<!-- 环形进度 -->
		<circle class="progress-ring" cx="12" cy="12" r="8" />

		<!-- 时钟主体 -->
		<circle class="clock" cx="12" cy="12" r="7" />

		<!-- 时针 -->
		<g class="hour-hand">
			<path d="M12 12V8.8" class="hand" />
		</g>

		<!-- 分针 -->
		<g class="minute-hand">
			<path d="M12 12V7.5" class="hand" />
		</g>

		<!-- 中心轴 -->
		<circle class="center" cx="12" cy="12" r="0.9" />
	</svg>
</template>

<style scoped lang="scss">
svg {
	width: 100%;
	height: 100%;
	overflow: visible;
	background: transparent;
}

.pulse-ring {
	fill: none;
	stroke: currentColor;
	stroke-width: 1;
	opacity: 0;

	transform-origin: 12px 12px;
	animation: pulse 2s ease-out infinite;
}

.progress-ring {
	fill: none;
	stroke: currentColor;
	stroke-width: 1.5;
	stroke-linecap: round;

	stroke-dasharray: 30 20;
	stroke-dashoffset: 50;

	transform-origin: 12px 12px;
	animation:
		progress 2.4s linear infinite,
		rotate 8s linear infinite;
}

.clock {
	fill: none;
	stroke: currentColor;
	stroke-width: 1.5;
}

/* 时针：每个动画周期逆时针旋转 1/60 圈 */
.hour-hand {
	transform-origin: 12px 12px;
	animation: hour-hand 180s linear infinite;
}

/* 分针：每个动画周期逆时针旋转 1 圈 */
.minute-hand {
	transform-origin: 12px 12px;
	animation: minute-hand 3s linear infinite;
}

.hand {
	fill: none;
	stroke: currentColor;
	stroke-width: 1.2;
	stroke-linecap: round;
}

.center {
	fill: currentColor;
}

/* 动态光晕 */
@keyframes pulse {
	0% {
		opacity: 0;
		transform: scale(0.85);
	}

	20% {
		opacity: 0.4;
	}

	70% {
		opacity: 0;
		transform: scale(1.25);
	}

	100% {
		opacity: 0;
		transform: scale(1.25);
	}
}

/* 环形进度 */
@keyframes progress {
	0% {
		stroke-dashoffset: 50;
	}

	100% {
		stroke-dashoffset: 0;
	}
}

/* 环形轨迹旋转 */
@keyframes rotate {
	from {
		transform: rotate(-90deg);
	}

	to {
		transform: rotate(270deg);
	}
}

/* 时针逆时针旋转 1/60 圈 */
@keyframes hour-hand {
	from {
		transform: rotate(0deg);
	}

	to {
		transform: rotate(-360deg);
	}
}

/* 分针逆时针旋转 1 圈 */
@keyframes minute-hand {
	from {
		transform: rotate(0deg);
	}

	to {
		transform: rotate(-360deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.pulse-ring,
	.progress-ring,
	.hour-hand,
	.minute-hand {
		animation: none;
	}

	.pulse-ring {
		opacity: 0.2;
	}

	.progress-ring {
		stroke-dashoffset: 0;
	}
}
</style>
