<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useDocumentStore } from '@/stores/document';
import { useSelectionStore } from '@/stores/selection';
import { useMcpService } from '@/services/mcp';
import { storeToRefs } from 'pinia';

interface Property {
  modelType: string;
  idShort: string;
  valueType?: string;
  value?: unknown;
  semanticId?: {
    keys?: Array<{ value: string }>;
  };
}

const props = defineProps<{
  element: Property;
}>();

const documentStore = useDocumentStore();
const selectionStore = useSelectionStore();
const mcpService = useMcpService();

const { selected } = storeToRefs(selectionStore);

const localValue = ref<string>(String(props.element.value ?? ''));
const isEditing = ref(false);
const isSaving = ref(false);

const hasChanges = computed(() => {
  return localValue.value !== String(props.element.value ?? '');
});

const semanticId = computed(() => {
  return props.element.semanticId?.keys?.[0]?.value || 'None';
});

watch(
  () => props.element,
  (newElement) => {
    localValue.value = String(newElement.value ?? '');
    isEditing.value = false;
  }
);

async function save() {
  if (!hasChanges.value) return;

  // Get the JSON Pointer path from the selection
  const elementPath = selected.value?.path;
  if (!elementPath) {
    console.error('Cannot save: no selection path available');
    return;
  }

  isSaving.value = true;

  try {
    // Construct the full path to the value property
    const path = `${elementPath}/value`;

    const result = await mcpService.callTool('edit_set_property', {
      path,
      value: localValue.value,
      reason: 'User edit',
    });

    if (result.success) {
      await documentStore.refreshState();
    }
  } finally {
    isSaving.value = false;
  }
}

function cancel() {
  localValue.value = String(props.element.value ?? '');
  isEditing.value = false;
}
</script>

<template>
  <div class="property-editor panel">
    <div class="property-header">
      <span class="property-icon">🔤</span>
      <span class="property-name">{{ element.idShort }}</span>
      <span class="property-type">{{ element.valueType || 'xs:string' }}</span>
    </div>

    <div class="property-meta">
      <div class="meta-row">
        <span class="meta-label">Semantic ID:</span>
        <span class="meta-value">{{ semanticId }}</span>
      </div>
    </div>

    <div class="property-value">
      <label class="value-label">Value</label>
      <div class="value-input">
        <input
          v-model="localValue"
          type="text"
          class="input"
          :disabled="isSaving"
          @focus="isEditing = true"
        />
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
.property-editor {
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

.property-value {
  margin-bottom: 1rem;
}

.value-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.value-input .input {
  width: 100%;
  padding: 0.75rem;
  font-size: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
}

.value-input .input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.property-actions {
  display: flex;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}
</style>
