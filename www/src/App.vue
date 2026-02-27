<template>
	<main class="main">
		<RouterView></RouterView>
	</main>
</template>

<script setup lang="ts"></script>

<style>
* {
	padding: 0;
	margin: 0;
	box-sizing: border-box;
}

html,
body {
	width: 100%;
	height: 100%;
}

#app {
	width: 100%;
	height: 100%;
}

.main {
	width: 100%;
	height: 100%;
	overflow-y: auto;
}
</style>
