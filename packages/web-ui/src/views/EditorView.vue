<script setup lang="ts">
import { computed } from 'vue';
import { useSelectionStore } from '@/stores/selection';
import { useDocumentStore } from '@/stores/document';
import { storeToRefs } from 'pinia';
import PropertyEditor from '@/components/editor/PropertyEditor.vue';
import JsonViewer from '@/components/editor/JsonViewer.vue';
import ApprovalPanel from '@/components/approval/ApprovalPanel.vue';

const selectionStore = useSelectionStore();
const documentStore = useDocumentStore();

const { selected } = storeToRefs(selectionStore);
const { pendingOperations, isLoaded } = storeToRefs(documentStore);

const hasPendingOperations = computed(() => pendingOperations.value.length > 0);
</script>

<template>
  <div class="editor-view">
    <div class="editor-main">
      <template v-if="isLoaded">
        <template v-if="selected">
          <div class="editor-header">
            <h2>{{ selected.type }}: {{ selected.id }}</h2>
          </div>

          <div class="editor-content">
            <PropertyEditor
              v-if="selected.type === 'Property'"
              :element="(selected.data as never)"
            />
            <JsonViewer v-else :data="selected.data" />
          </div>
        </template>

        <template v-else>
          <div class="empty-selection">
            <p>Select an element from the tree to edit</p>
          </div>
        </template>
      </template>

      <template v-else>
        <div class="empty-document">
          <h2>Welcome to AASX AI Editor</h2>
          <p>Open an AASX file to get started</p>
          <button class="btn btn-primary" @click="documentStore.openFile">
            Open File
          </button>
        </div>
      </template>
    </div>

    <aside v-if="hasPendingOperations" class="approval-sidebar">
      <ApprovalPanel />
    </aside>
  </div>
</template>

<style scoped>
.editor-view {
  display: flex;
  height: 100%;
  gap: 1rem;
}

.editor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.editor-header {
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 1rem;
}

.editor-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.editor-content {
  flex: 1;
  overflow: auto;
}

.empty-selection,
.empty-document {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--color-text-muted);
  gap: 1rem;
}

.empty-document h2 {
  color: var(--color-text-primary);
}

.approval-sidebar {
  width: 320px;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 1rem;
  overflow: auto;
}
</style>
