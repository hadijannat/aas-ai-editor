<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useDocumentStore } from '@/stores/document';
import { useSelectionStore } from '@/stores/selection';
import { useMcpService } from '@/services/mcp';
import { storeToRefs } from 'pinia';

interface File {
  modelType: 'File';
  idShort: string;
  contentType: string;
  value?: string;
  semanticId?: {
    keys?: Array<{ value: string }>;
  };
}

const props = defineProps<{
  element: File;
}>();

const documentStore = useDocumentStore();
const selectionStore = useSelectionStore();
const mcpService = useMcpService();

const { selected } = storeToRefs(selectionStore);

const localValue = ref<string>(props.element.value ?? '');
const localContentType = ref<string>(props.element.contentType ?? 'application/octet-stream');
const isEditing = ref(false);
const isSaving = ref(false);

const hasChanges = computed(() => {
  return localValue.value !== (props.element.value ?? '') ||
         localContentType.value !== (props.element.contentType ?? '');
});

const semanticId = computed(() => {
  return props.element.semanticId?.keys?.[0]?.value || 'None';
});

// Common content types
const commonContentTypes = [
  'application/pdf',
  'application/octet-stream',
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'text/plain',
  'text/xml',
  'application/json',
  'application/xml',
];

watch(
  () => props.element,
  (newElement) => {
    localValue.value = newElement.value ?? '';
    localContentType.value = newElement.contentType ?? 'application/octet-stream';
    isEditing.value = false;
  }
);

async function save() {
  if (!hasChanges.value) return;

  const elementPath = selected.value?.path;
  if (!elementPath) {
    console.error('Cannot save: no selection path available');
    return;
  }

  isSaving.value = true;

  try {
    // Update value if changed
    if (localValue.value !== (props.element.value ?? '')) {
      await mcpService.callTool('edit_update', {
        path: `${elementPath}/value`,
        value: localValue.value || null,
        reason: 'User edit',
      });
    }

    // Update contentType if changed
    if (localContentType.value !== props.element.contentType) {
      await mcpService.callTool('edit_update', {
        path: `${elementPath}/contentType`,
        value: localContentType.value,
        reason: 'User edit',
      });
    }

    await documentStore.refreshState();
  } finally {
    isSaving.value = false;
  }
}

function cancel() {
  localValue.value = props.element.value ?? '';
  localContentType.value = props.element.contentType ?? 'application/octet-stream';
  isEditing.value = false;
}
</script>

<template>
  <div class="file-editor panel">
    <div class="property-header">
      <span class="property-icon">📄</span>
      <span class="property-name">{{ element.idShort }}</span>
      <span class="property-type">File</span>
    </div>

    <div class="property-meta">
      <div class="meta-row">
        <span class="meta-label">Semantic ID:</span>
        <span class="meta-value">{{ semanticId }}</span>
      </div>
    </div>

    <div class="file-fields">
      <div class="field-group">
        <label class="value-label">Content Type</label>
        <div class="content-type-input">
          <select
            v-model="localContentType"
            class="input"
            :disabled="isSaving"
            @change="isEditing = true"
          >
            <option
              v-for="type in commonContentTypes"
              :key="type"
              :value="type"
            >
              {{ type }}
            </option>
          </select>
          <input
            v-model="localContentType"
            type="text"
            class="input"
            placeholder="Or enter custom MIME type..."
            :disabled="isSaving"
            @focus="isEditing = true"
          />
        </div>
      </div>

      <div class="field-group">
        <label class="value-label">File Path / URL</label>
        <input
          v-model="localValue"
          type="text"
          class="input"
          placeholder="/aasx/files/document.pdf or https://..."
          :disabled="isSaving"
          @focus="isEditing = true"
        />
        <div class="field-hint">
          Path within the AASX package (e.g., /aasx/files/manual.pdf) or external URL
        </div>
      </div>
    </div>

    <div v-if="hasChanges" class="property-actions">
      <button
        class="btn btn-primary"
        :disabled="isSaving"
        @click="save"
      >
        {{ isSaving ? 'Saving...' : 'Save' }}
      </button>
      <button
        class="btn btn-secondary"
        :disabled="isSaving"
        @click="cancel"
      >
        Cancel
      </button>
    </div>
  </div>
</template>

<style scoped>
.file-editor {
  max-width: 600px;
}

.property-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border);
}

.property-icon {
  font-size: 1.5rem;
}

.property-name {
  font-size: 1.25rem;
  font-weight: 600;
}

.property-type {
  margin-left: auto;
  font-size: 0.875rem;
  color: var(--color-text-muted);
  background-color: var(--color-bg-tertiary);
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}

.property-meta {
  margin-bottom: 1.5rem;
}

.meta-row {
  display: flex;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.meta-label {
  color: var(--color-text-secondary);
}

.meta-value {
  font-family: monospace;
  word-break: break-all;
}

.file-fields {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-bottom: 1rem;
}

.field-group {
  display: flex;
  flex-direction: column;
}

.value-label {
  margin-bottom: 0.5rem;
  font-weight: 500;
  font-size: 0.875rem;
}

.content-type-input {
  display: flex;
  gap: 0.5rem;
}

.content-type-input select {
  width: 200px;
}

.content-type-input input {
  flex: 1;
}

.input {
  padding: 0.75rem;
  font-size: 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.field-hint {
  margin-top: 0.375rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.property-actions {
  display: flex;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}
</style>
