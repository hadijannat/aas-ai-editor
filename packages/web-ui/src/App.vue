<script setup lang="ts">
import { RouterView } from 'vue-router';
import AppHeader from './components/layout/AppHeader.vue';
import AppSidebar from './components/layout/AppSidebar.vue';
import NotificationToast from './components/ui/NotificationToast.vue';
</script>

<template>
  <div class="app-container">
    <AppHeader />
    <div class="app-content">
      <AppSidebar />
      <main class="main-content">
        <RouterView />
      </main>
    </div>
    <NotificationToast />
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow: auto;
  padding: 1rem;
}
</style>
