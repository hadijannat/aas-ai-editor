/**
 * Vue Application Entry Point
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';

// Styles
import './styles/main.css';

// Create Pinia store
const pinia = createPinia();

// Create router
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'editor',
      component: () => import('./views/EditorView.vue'),
    },
    {
      path: '/import',
      name: 'import',
      component: () => import('./views/ImportView.vue'),
    },
    {
      path: '/validation',
      name: 'validation',
      component: () => import('./views/ValidationView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('./views/SettingsView.vue'),
    },
  ],
});

// Create and mount app
const app = createApp(App);

app.use(pinia);
app.use(router);

app.mount('#app');

// Expose pinia for E2E tests
if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  (window as unknown as { __pinia__: typeof pinia }).__pinia__ = pinia;
}
