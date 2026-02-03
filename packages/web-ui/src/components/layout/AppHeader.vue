<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router';
import { useDocumentStore } from '@/stores/document';
import { storeToRefs } from 'pinia';

const route = useRoute();
const documentStore = useDocumentStore();
const { isLoaded, isDirty, filename } = storeToRefs(documentStore);
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <div class="logo">
        <span class="logo-icon">📦</span>
        <span class="logo-text">AASX AI Editor</span>
      </div>

      <nav class="header-nav">
        <RouterLink to="/" class="nav-link" :class="{ active: route.path === '/' }">
          Editor
        </RouterLink>
        <RouterLink to="/validation" class="nav-link" :class="{ active: route.path === '/validation' }">
          Validation
        </RouterLink>
        <RouterLink to="/import" class="nav-link" :class="{ active: route.path === '/import' }">
          Import
        </RouterLink>
        <RouterLink to="/settings" class="nav-link" :class="{ active: route.path === '/settings' }">
          Settings
        </RouterLink>
      </nav>
    </div>

    <div class="header-center">
      <template v-if="isLoaded">
        <span class="filename">{{ filename }}</span>
        <span v-if="isDirty" class="dirty-indicator">●</span>
      </template>
      <template v-else>
        <span class="no-document">No document loaded</span>
      </template>
    </div>

    <div class="header-right">
      <button class="btn btn-secondary" @click="documentStore.openFile">
        Open
      </button>
      <button
        class="btn btn-primary"
        :disabled="!isLoaded || !isDirty"
        @click="() => documentStore.saveFile()"
      >
        Save
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding: 0 1rem;
  background-color: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 2rem;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}

.logo-icon {
  font-size: 1.5rem;
}

.header-nav {
  display: flex;
  gap: 0.25rem;
}

.nav-link {
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: all 0.15s;
}

.nav-link:hover {
  background-color: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.nav-link.active {
  background-color: var(--color-bg-tertiary);
  color: var(--color-primary);
  font-weight: 500;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filename {
  font-weight: 500;
}

.dirty-indicator {
  color: var(--color-warning);
}

.no-document {
  color: var(--color-text-muted);
}

.header-right {
  display: flex;
  gap: 0.5rem;
}
</style>
