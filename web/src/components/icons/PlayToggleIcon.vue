<template>
	<svg
		class="play-toggle-icon"
		:class="{ 'is-pause': !play }"
		viewBox="0 0 1024 1024"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			class="play-toggle-icon__shape play-toggle-icon__shape--left"
			d="M258 82C322 99 420 158 517 217C517 217 517 512 517 512C517 512 517 807 517 807C420 866 322 925 258 942C228 942 201 930 180 910C156 887 142 858 142 826C142 826 142 198 142 198C142 134 194 82 258 82Z"
		/>
		<path
			class="play-toggle-icon__shape play-toggle-icon__shape--right"
			d="M509 212C624 282 742 353 858 423C875 434 888 451 895 469C903 488 905 501 899 512C905 523 903 536 895 555C888 573 875 590 858 601C742 671 624 742 509 812C509 812 509 512 509 512C509 512 509 212 509 212Z"
		/>
	</svg>
</template>

<script setup lang="ts">
import { useVModel } from '@vueuse/core';

const props = withDefaults(
	defineProps<{
		play?: boolean;
	}>(),
	{
		play: false,
	},
);
const emit = defineEmits<{
	(e: 'play', play: boolean): void;
}>();

const playModel = useVModel(props, 'play', emit);
const playRef = ref(props.play);
const play = computed({
	get() {
		return playRef.value;
	},
	set(value) {
		playRef.value = value;
		playModel.value = value;
	},
});

watch(
	() => props.play,
	(value) => {
		if (value) {
			toPlay();
		} else {
			toPause();
		}
	},
);

function toPlay() {
	if (!play.value) {
		play.value = true;
	}
}

function toPause() {
	if (play.value) {
		play.value = false;
	}
}

function toggle() {
	play.value = !play.value;
}

defineOptions({
	inheritAttrs: true,
});

defineExpose({
	toPlay,
	toPause,
	toggle,
});
</script>

<style scoped>
.play-toggle-icon__shape {
	transition: d 360ms cubic-bezier(0.22, 0.8, 0.32, 1);
}

.play-toggle-icon__shape--left {
	d: path(
		'M 258 82 C 322 99 420 158 517 217 C 517 217 517 512 517 512 C 517 512 517 807 517 807 C 420 866 322 925 258 942 C 228 942 201 930 180 910 C 156 887 142 858 142 826 C 142 826 142 198 142 198 C 142 134 194 82 258 82 Z'
	);
}

.play-toggle-icon__shape--right {
	d: path(
		'M 509 212 C 624 282 742 353 858 423 C 875 434 888 451 895 469 C 903 488 905 501 899 512 C 905 523 903 536 895 555 C 888 573 875 590 858 601 C 742 671 624 742 509 812 C 509 812 509 512 509 512 C 509 512 509 212 509 212 Z'
	);
}

.play-toggle-icon.is-pause .play-toggle-icon__shape--left {
	d: path(
		'M 255 82 C 335 82 400 147 400 227 C 400 227 400 512 400 512 C 400 512 400 797 400 797 C 400 877 335 942 255 942 C 215 942 179 926 152 900 C 126 873 110 837 110 797 C 110 797 110 227 110 227 C 110 147 175 82 255 82 Z'
	);
}

.play-toggle-icon.is-pause .play-toggle-icon__shape--right {
	d: path(
		'M 769 82 C 849 82 914 147 914 227 C 914 227 914 512 914 512 C 914 512 914 797 914 797 C 914 877 849 942 769 942 C 729 942 693 926 666 900 C 640 873 624 837 624 797 C 624 797 624 227 624 227 C 624 147 689 82 769 82 Z'
	);
}
</style>
