<template>
	<main class="main">
		<RouterView v-slot="{ Component }">
			<KeepAlive :include="['Index', 'Video']">
				<component :is="Component"></component>
			</KeepAlive>
		</RouterView>
	</main>
</template>

<script setup lang="ts"></script>

<style>
.main {
	width: 100%;
	height: 100%;
	background-color: var(--background-color);
	overflow: hidden;
}
</style>
