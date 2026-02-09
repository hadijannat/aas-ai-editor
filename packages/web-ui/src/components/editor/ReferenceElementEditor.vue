<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useDocumentStore } from '@/stores/document';
import { useSelectionStore } from '@/stores/selection';
import { useMcpService } from '@/services/mcp';
import { storeToRefs } from 'pinia';

interface Key {
  type: string;
  value: string;
}

interface Reference {
  type: 'ExternalReference' | 'ModelReference';
  keys: Key[];
}

interface ReferenceElement {
  modelType: 'ReferenceElement';
  idShort: string;
  value?: Reference;
  semanticId?: {
    keys?: Array<{ value: string }>;
  };
}

const props = defineProps<{
  element: ReferenceElement;
}>();

const documentStore = useDocumentStore();
const selectionStore = useSelectionStore();
const mcpService = useMcpService();

const { selected } = storeToRefs(selectionStore);

// Local state for editing
const localRefType = ref<'ExternalReference' | 'ModelReference'>(
  props.element.value?.type ?? 'ExternalReference'
);
const localKeys = ref<Key[]>(structuredClone(props.element.value?.keys || []));
const isEditing = ref(false);
const isSaving = ref(false);

// Key types
const keyTypes = [
  'GlobalReference',
  'FragmentReference',
  'AssetAdministrationShell',
  'Submodel',
  'ConceptDescription',
  'SubmodelElement',
];

const hasChanges = computed(() => {
  const original = props.element.value;
  if (!original && localKeys.value.length === 0) return false;
  if (!original) return true;

  return localRefType.value !== original.type ||
         JSON.stringify(localKeys.value) !== JSON.stringify(original.keys);
});

const semanticId = computed(() => {
  return props.element.semanticId?.keys?.[0]?.value || 'None';
});

watch(
  () => props.element,
  (newElement) => {
    localRefType.value = newElement.value?.type ?? 'ExternalReference';
    localKeys.value = structuredClone(newElement.value?.keys || []);
    isEditing.value = false;
  }
);

function addKey() {
  localKeys.value.push({
    type: 'GlobalReference',
    value: '',
  });
  isEditing.value = true;
}

function removeKey(index: number) {
  localKeys.value.splice(index, 1);
  isEditing.value = true;
}

function updateKey(index: number, field: 'type' | 'value', newValue: string) {
  const key = localKeys.value[index];
  if (!key) return;
  key[field] = newValue;
  isEditing.value = true;
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
    const newValue: Reference | null = localKeys.value.length > 0
      ? {
          type: localRefType.value,
          keys: localKeys.value.filter(k => k.value.trim() !== ''),
        }
      : null;

    await mcpService.callTool('edit_update', {
      path: `${elementPath}/value`,
      value: newValue,
      reason: 'User edit',
    });

    await documentStore.refreshState();
  } finally {
    isSaving.value = false;
  }
}

function cancel() {
  localRefType.value = props.element.value?.type ?? 'ExternalReference';
  localKeys.value = structuredClone(props.element.value?.keys || []);
  isEditing.value = false;
}
</script>

<template>
  <div class="reference-editor panel">
    <div class="property-header">
      <span class="property-icon">🔗</span>
      <span class="property-name">{{ element.idShort }}</span>
      <span class="property-type">ReferenceElement</span>
    </div>

    <div class="property-meta">
      <div class="meta-row">
        <span class="meta-label">Semantic ID:</span>
        <span class="meta-value">{{ semanticId }}</span>
      </div>
    </div>

    <div class="reference-fields">
      <div class="field-group">
        <label class="value-label">Reference Type</label>
        <select
          v-model="localRefType"
          class="input"
          :disabled="isSaving"
          @change="isEditing = true"
        >
          <option value="ExternalReference">External Reference</option>
          <option value="ModelReference">Model Reference</option>
        </select>
      </div>

      <div class="field-group">
        <label class="value-label">Reference Keys</label>
        <div class="keys-list">
          <div
            v-for="(key, index) in localKeys"
            :key="index"
            class="key-item"
          >
            <select
              :value="key.type"
              class="input key-type"
              :disabled="isSaving"
              @change="(e) => updateKey(index, 'type', (e.target as HTMLSelectElement).value)"
            >
              <option v-for="type in keyTypes" :key="type" :value="type">
                {{ type }}
              </option>
            </select>
            <input
              :value="key.value"
              type="text"
              class="input key-value"
              placeholder="Reference value (ID or URL)"
              :disabled="isSaving"
              @input="(e) => updateKey(index, 'value', (e.target as HTMLInputElement).value)"
            />
            <button
              class="btn btn-icon btn-danger"
              :disabled="isSaving"
              title="Remove key"
              @click="removeKey(index)"
            >
              ✕
            </button>
          </div>

          <div v-if="localKeys.length === 0" class="empty-message">
            No reference keys defined
          </div>
        </div>

        <button
          class="btn btn-secondary add-key-btn"
          :disabled="isSaving"
          @click="addKey"
        >
          + Add Key
        </button>
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
.reference-editor {
  max-width: 700px;
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

.reference-fields {
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
  padding: 0.5rem;
  font-size: 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.keys-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.key-item {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.key-type {
  width: 180px;
}

.key-value {
  flex: 1;
}

.empty-message {
  color: var(--color-text-muted);
  font-style: italic;
  padding: 1rem;
  text-align: center;
  background-color: var(--color-bg-secondary);
  border-radius: 0.375rem;
}

.add-key-btn {
  align-self: flex-start;
}

.btn-icon {
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
}

.btn-danger {
  color: var(--color-danger);
  background: transparent;
  border: 1px solid var(--color-danger);
}

.btn-danger:hover {
  background-color: var(--color-danger);
  color: white;
}

.property-actions {
  display: flex;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}
</style>
