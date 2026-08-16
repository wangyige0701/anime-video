<template>
	<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
		<g :transform="props.direction === 'bottom' ? 'rotate(180 12 12)' : undefined">
			<path
				d="M12 2.1a1.55 1.55 0 0 1 1.1.46l7.47 7.47a4.65 4.65 0 0 1 1.36 3.29v4.46A4.22 4.22 0 0 1 17.71 22H6.29a4.22 4.22 0 0 1-4.22-4.22v-4.46c0-1.23.49-2.42 1.36-3.29l7.47-7.47A1.55 1.55 0 0 1 12 2.1z"
				fill="currentColor"
			/>
		</g>
	</svg>
</template>

<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		direction?: 'top' | 'bottom';
	}>(),
	{
		direction: 'top',
	},
);
</script>
