<script setup lang="ts">
import { useDocumentStore } from '@/stores/document';
import AasTree from '@/components/tree/AasTree.vue';
import { storeToRefs } from 'pinia';

const documentStore = useDocumentStore();
const { isLoaded } = storeToRefs(documentStore);
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h3>Structure</h3>
    </div>

    <div class="sidebar-content">
      <template v-if="isLoaded">
        <AasTree />
      </template>
      <template v-else>
        <div class="empty-state">
          <p>Open an AASX file to view its structure</p>
          <button class="btn btn-primary" @click="documentStore.openFile">
            Open File
          </button>
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  background-color: var(--color-bg-primary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.sidebar-header h3 {
  margin: 0;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
}

.sidebar-content {
  flex: 1;
  overflow: auto;
  padding: 0.5rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--color-text-muted);
  gap: 1rem;
}
</style>
