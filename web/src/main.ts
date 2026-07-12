import '@/assets/iconfont.scss';
import '@/assets/root.scss';
import '@/assets/main.scss';
import '@/assets/elements.scss';

import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount('#app');
