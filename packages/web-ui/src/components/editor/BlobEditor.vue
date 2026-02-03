<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useDocumentStore } from '@/stores/document';
import { useSelectionStore } from '@/stores/selection';
import { useMcpService } from '@/services/mcp';
import { storeToRefs } from 'pinia';

interface Blob {
  modelType: 'Blob';
  idShort: string;
  contentType: string;
  value?: string; // base64 encoded
  semanticId?: {
    keys?: Array<{ value: string }>;
  };
}

const props = defineProps<{
  element: Blob;
}>();

const documentStore = useDocumentStore();
const selectionStore = useSelectionStore();
const mcpService = useMcpService();

const { selected } = storeToRefs(selectionStore);

const localContentType = ref<string>(props.element.contentType ?? 'application/octet-stream');
const isEditing = ref(false);
const isSaving = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const pendingFile = ref<File | null>(null);

const hasChanges = computed(() => {
  return localContentType.value !== (props.element.contentType ?? '') || pendingFile.value !== null;
});

const semanticId = computed(() => {
  return props.element.semanticId?.keys?.[0]?.value || 'None';
});

const blobSize = computed(() => {
  if (!props.element.value) return 'Empty';
  // Base64 is roughly 4/3 the size of binary
  const bytes = Math.round((props.element.value.length * 3) / 4);
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
});

// Common content types
const commonContentTypes = [
  'application/octet-stream',
  'image/png',
  'image/jpeg',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/json',
];

watch(
  () => props.element,
  (newElement) => {
    localContentType.value = newElement.contentType ?? 'application/octet-stream';
    isEditing.value = false;
    pendingFile.value = null;
  }
);

function triggerFileSelect() {
  fileInput.value?.click();
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    pendingFile.value = input.files[0];
    // Auto-detect content type from file
    if (pendingFile.value.type) {
      localContentType.value = pendingFile.value.type;
    }
    isEditing.value = true;
  }
}

async function save() {
  if (!hasChanges.value) return;

  const elementPath = selected.value?.path;
  if (!elementPath) {
    console.error('Cannot save: no selection path available');
    return;
  }

  isSaving.value = true;

  try {
    // If there's a pending file, read it and convert to base64
    if (pendingFile.value) {
      const base64 = await readFileAsBase64(pendingFile.value);

      await mcpService.callTool('edit_update', {
        path: `${elementPath}/value`,
        value: base64,
        reason: 'User upload',
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
    pendingFile.value = null;
  } finally {
    isSaving.value = false;
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (data:mime;base64,)
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function cancel() {
  localContentType.value = props.element.contentType ?? 'application/octet-stream';
  isEditing.value = false;
  pendingFile.value = null;
}

function downloadBlob() {
  if (!props.element.value) return;

  const byteCharacters = atob(props.element.value);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new window.Blob([byteArray], { type: props.element.contentType });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.element.idShort}.bin`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="blob-editor panel">
    <div class="property-header">
      <span class="property-icon">💾</span>
      <span class="property-name">{{ element.idShort }}</span>
      <span class="property-type">Blob</span>
    </div>

    <div class="property-meta">
      <div class="meta-row">
        <span class="meta-label">Semantic ID:</span>
        <span class="meta-value">{{ semanticId }}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Size:</span>
        <span class="meta-value">{{ blobSize }}</span>
      </div>
    </div>

    <div class="blob-fields">
      <div class="field-group">
        <label class="value-label">Content Type</label>
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
      </div>

      <div class="field-group">
        <label class="value-label">Binary Data</label>
        <div class="blob-actions">
          <input
            ref="fileInput"
            type="file"
            class="hidden"
            @change="handleFileSelect"
          />
          <button
            class="btn btn-secondary"
            :disabled="isSaving"
            @click="triggerFileSelect"
          >
            📁 Upload File
          </button>
          <button
            v-if="element.value"
            class="btn btn-secondary"
            :disabled="isSaving"
            @click="downloadBlob"
          >
            ⬇️ Download
          </button>
        </div>
        <div v-if="pendingFile" class="pending-file">
          Pending: {{ pendingFile.name }} ({{ (pendingFile.size / 1024).toFixed(1) }} KB)
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
.blob-editor {
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
  margin-bottom: 0.25rem;
}

.meta-label {
  color: var(--color-text-secondary);
}

.meta-value {
  font-family: monospace;
  word-break: break-all;
}

.blob-fields {
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

.input {
  padding: 0.75rem;
  font-size: 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.hidden {
  display: none;
}

.blob-actions {
  display: flex;
  gap: 0.5rem;
}

.pending-file {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background-color: var(--color-bg-secondary);
  border-radius: 0.375rem;
  font-size: 0.875rem;
  color: var(--color-primary);
}

.property-actions {
  display: flex;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}
</style>
