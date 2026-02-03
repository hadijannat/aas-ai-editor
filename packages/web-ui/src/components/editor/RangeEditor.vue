<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useDocumentStore } from '@/stores/document';
import { useSelectionStore } from '@/stores/selection';
import { useMcpService } from '@/services/mcp';
import { storeToRefs } from 'pinia';

interface Range {
  modelType: 'Range';
  idShort: string;
  valueType: string;
  min?: string;
  max?: string;
  semanticId?: {
    keys?: Array<{ value: string }>;
  };
}

const props = defineProps<{
  element: Range;
}>();

const documentStore = useDocumentStore();
const selectionStore = useSelectionStore();
const mcpService = useMcpService();

const { selected } = storeToRefs(selectionStore);

const localMin = ref<string>(props.element.min ?? '');
const localMax = ref<string>(props.element.max ?? '');
const isEditing = ref(false);
const isSaving = ref(false);
const validationError = ref<string | null>(null);

const hasChanges = computed(() => {
  return localMin.value !== (props.element.min ?? '') ||
         localMax.value !== (props.element.max ?? '');
});

const semanticId = computed(() => {
  return props.element.semanticId?.keys?.[0]?.value || 'None';
});

// Validate min <= max for numeric types
const isNumericType = computed(() => {
  const numericTypes = [
    'xs:integer', 'xs:int', 'xs:long', 'xs:short', 'xs:byte',
    'xs:unsignedInt', 'xs:unsignedLong', 'xs:unsignedShort', 'xs:unsignedByte',
    'xs:double', 'xs:float', 'xs:decimal',
  ];
  return numericTypes.includes(props.element.valueType);
});

watch([localMin, localMax], () => {
  if (isNumericType.value && localMin.value && localMax.value) {
    const min = parseFloat(localMin.value);
    const max = parseFloat(localMax.value);
    if (!isNaN(min) && !isNaN(max) && min > max) {
      validationError.value = 'Minimum value cannot be greater than maximum';
    } else {
      validationError.value = null;
    }
  } else {
    validationError.value = null;
  }
});

watch(
  () => props.element,
  (newElement) => {
    localMin.value = newElement.min ?? '';
    localMax.value = newElement.max ?? '';
    isEditing.value = false;
  }
);

async function save() {
  if (!hasChanges.value || validationError.value) return;

  const elementPath = selected.value?.path;
  if (!elementPath) {
    console.error('Cannot save: no selection path available');
    return;
  }

  isSaving.value = true;

  try {
    // Update min if changed
    if (localMin.value !== (props.element.min ?? '')) {
      await mcpService.callTool('edit_update', {
        path: `${elementPath}/min`,
        value: localMin.value || null,
        reason: 'User edit',
      });
    }

    // Update max if changed
    if (localMax.value !== (props.element.max ?? '')) {
      await mcpService.callTool('edit_update', {
        path: `${elementPath}/max`,
        value: localMax.value || null,
        reason: 'User edit',
      });
    }

    await documentStore.refreshState();
  } finally {
    isSaving.value = false;
  }
}

function cancel() {
  localMin.value = props.element.min ?? '';
  localMax.value = props.element.max ?? '';
  isEditing.value = false;
  validationError.value = null;
}
</script>

<template>
  <div class="range-editor panel">
    <div class="property-header">
      <span class="property-icon">↔️</span>
      <span class="property-name">{{ element.idShort }}</span>
      <span class="property-type">Range</span>
    </div>

    <div class="property-meta">
      <div class="meta-row">
        <span class="meta-label">Semantic ID:</span>
        <span class="meta-value">{{ semanticId }}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Value Type:</span>
        <span class="meta-value">{{ element.valueType }}</span>
      </div>
    </div>

    <div class="range-inputs">
      <div class="range-field">
        <label class="value-label">Minimum</label>
        <input
          v-model="localMin"
          type="text"
          class="input"
          :class="{ 'input-error': validationError }"
          placeholder="No minimum"
          :disabled="isSaving"
          @focus="isEditing = true"
        />
      </div>

      <span class="range-separator">to</span>

      <div class="range-field">
        <label class="value-label">Maximum</label>
        <input
          v-model="localMax"
          type="text"
          class="input"
          :class="{ 'input-error': validationError }"
          placeholder="No maximum"
          :disabled="isSaving"
          @focus="isEditing = true"
        />
      </div>
    </div>

    <div v-if="validationError" class="validation-error">
      {{ validationError }}
    </div>

    <div v-if="hasChanges" class="property-actions">
      <button
        class="btn btn-primary"
        :disabled="isSaving || !!validationError"
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
.range-editor {
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

.range-inputs {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 1rem;
}

.range-field {
  flex: 1;
}

.range-separator {
  padding-bottom: 0.75rem;
  color: var(--color-text-muted);
  font-weight: 500;
}

.value-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  font-size: 0.875rem;
}

.input {
  width: 100%;
  padding: 0.75rem;
  font-size: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.input-error {
  border-color: var(--color-danger);
}

.input-error:focus {
  border-color: var(--color-danger);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}

.validation-error {
  color: var(--color-danger);
  font-size: 0.875rem;
  margin-bottom: 1rem;
  padding: 0.5rem;
  background-color: rgba(239, 68, 68, 0.1);
  border-radius: 0.375rem;
}

.property-actions {
  display: flex;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}
</style>
