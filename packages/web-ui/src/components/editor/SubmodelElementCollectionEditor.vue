<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useDocumentStore } from '@/stores/document';
import { useSelectionStore } from '@/stores/selection';
import { useMcpService } from '@/services/mcp';
import { storeToRefs } from 'pinia';

interface SubmodelElement {
  modelType: string;
  idShort: string;
  value?: unknown;
  semanticId?: {
    keys?: Array<{ value: string }>;
  };
}

interface SubmodelElementCollection {
  modelType: 'SubmodelElementCollection';
  idShort: string;
  value?: SubmodelElement[];
  semanticId?: {
    keys?: Array<{ value: string }>;
  };
}

const props = defineProps<{
  element: SubmodelElementCollection;
}>();

const emit = defineEmits<{
  (e: 'select-child', path: string, element: SubmodelElement): void;
}>();

const documentStore = useDocumentStore();
const selectionStore = useSelectionStore();
const mcpService = useMcpService();

const { selected } = storeToRefs(selectionStore);

const isSaving = ref(false);
const isAddingElement = ref(false);
const newElementIdShort = ref('');
const newElementType = ref<string>('Property');

// Available element types for adding
const elementTypes = [
  { type: 'Property', icon: '🔤', description: 'Simple value' },
  { type: 'MultiLanguageProperty', icon: '🌐', description: 'Multi-language text' },
  { type: 'Range', icon: '↔️', description: 'Min/max range' },
  { type: 'File', icon: '📄', description: 'File reference' },
  { type: 'Blob', icon: '💾', description: 'Binary data' },
  { type: 'ReferenceElement', icon: '🔗', description: 'Reference to element' },
  { type: 'SubmodelElementCollection', icon: '📁', description: 'Nested collection' },
];

const semanticId = computed(() => {
  return props.element.semanticId?.keys?.[0]?.value || 'None';
});

const childCount = computed(() => props.element.value?.length ?? 0);

const sortedChildren = computed(() => {
  if (!props.element.value) return [];
  return [...props.element.value].sort((a, b) =>
    (a.idShort || '').localeCompare(b.idShort || '')
  );
});

function getElementIcon(modelType: string): string {
  const typeInfo = elementTypes.find(t => t.type === modelType);
  return typeInfo?.icon || '📦';
}

function selectChild(index: number) {
  const elementPath = selected.value?.path;
  if (!elementPath || !props.element.value) return;

  const child = props.element.value[index];
  const childPath = `${elementPath}/value/${index}`;

  emit('select-child', childPath, child);
}

async function addElement() {
  if (!newElementIdShort.value.trim()) return;

  const elementPath = selected.value?.path;
  if (!elementPath) {
    console.error('Cannot add: no selection path available');
    return;
  }

  isSaving.value = true;

  try {
    // Create base element
    const newElement: Record<string, unknown> = {
      modelType: newElementType.value,
      idShort: newElementIdShort.value.trim(),
    };

    // Add type-specific defaults
    switch (newElementType.value) {
      case 'Property':
        newElement.valueType = 'xs:string';
        newElement.value = '';
        break;
      case 'MultiLanguageProperty':
        newElement.value = [];
        break;
      case 'Range':
        newElement.valueType = 'xs:double';
        break;
      case 'File':
        newElement.contentType = 'application/octet-stream';
        break;
      case 'Blob':
        newElement.contentType = 'application/octet-stream';
        break;
      case 'ReferenceElement':
        newElement.value = null;
        break;
      case 'SubmodelElementCollection':
        newElement.value = [];
        break;
    }

    // Add to collection
    const path = `${elementPath}/value/-`;

    const result = await mcpService.callTool('edit_add', {
      path,
      value: newElement,
      reason: 'Add child element',
    });

    if (result.success) {
      await documentStore.refreshState();
      isAddingElement.value = false;
      newElementIdShort.value = '';
      newElementType.value = 'Property';
    }
  } finally {
    isSaving.value = false;
  }
}

async function removeElement(index: number) {
  const elementPath = selected.value?.path;
  if (!elementPath) return;

  const child = props.element.value?.[index];
  if (!child) return;

  if (!confirm(`Remove "${child.idShort}"?`)) return;

  isSaving.value = true;

  try {
    const path = `${elementPath}/value/${index}`;

    const result = await mcpService.callTool('edit_delete', {
      path,
      reason: 'Remove child element',
    });

    if (result.success) {
      await documentStore.refreshState();
    }
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="collection-editor panel">
    <div class="property-header">
      <span class="property-icon">📁</span>
      <span class="property-name">{{ element.idShort }}</span>
      <span class="property-type">Collection ({{ childCount }})</span>
    </div>

    <div class="property-meta">
      <div class="meta-row">
        <span class="meta-label">Semantic ID:</span>
        <span class="meta-value">{{ semanticId }}</span>
      </div>
    </div>

    <div class="children-section">
      <div class="section-header">
        <span class="section-title">Child Elements</span>
        <button
          class="btn btn-secondary btn-sm"
          :disabled="isSaving"
          @click="isAddingElement = true"
        >
          + Add Element
        </button>
      </div>

      <div v-if="isAddingElement" class="add-element-form">
        <input
          v-model="newElementIdShort"
          type="text"
          class="input"
          placeholder="Element idShort..."
          @keyup.enter="addElement"
          @keyup.escape="isAddingElement = false"
        />
        <select v-model="newElementType" class="input">
          <option
            v-for="type in elementTypes"
            :key="type.type"
            :value="type.type"
          >
            {{ type.icon }} {{ type.type }}
          </option>
        </select>
        <button
          class="btn btn-primary btn-sm"
          :disabled="!newElementIdShort.trim() || isSaving"
          @click="addElement"
        >
          Add
        </button>
        <button
          class="btn btn-secondary btn-sm"
          @click="isAddingElement = false"
        >
          Cancel
        </button>
      </div>

      <div v-if="sortedChildren.length === 0" class="empty-message">
        No child elements
      </div>

      <div v-else class="children-list">
        <div
          v-for="(child, index) in props.element.value"
          :key="child.idShort"
          class="child-item"
          @click="selectChild(index)"
        >
          <span class="child-icon">{{ getElementIcon(child.modelType) }}</span>
          <span class="child-name">{{ child.idShort }}</span>
          <span class="child-type">{{ child.modelType }}</span>
          <button
            class="btn btn-icon btn-danger"
            :disabled="isSaving"
            title="Remove"
            @click.stop="removeElement(index)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.collection-editor {
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

.children-section {
  margin-bottom: 1rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-title {
  font-weight: 600;
}

.add-element-form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 1rem;
  background-color: var(--color-bg-secondary);
  border-radius: 0.375rem;
}

.add-element-form .input {
  flex: 1;
}

.add-element-form select {
  width: 200px;
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

.empty-message {
  color: var(--color-text-muted);
  font-style: italic;
  padding: 1rem;
  text-align: center;
  background-color: var(--color-bg-secondary);
  border-radius: 0.375rem;
}

.children-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.child-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background-color: var(--color-bg-secondary);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background-color 0.15s;
}

.child-item:hover {
  background-color: var(--color-bg-tertiary);
}

.child-icon {
  font-size: 1rem;
}

.child-name {
  font-weight: 500;
  flex: 1;
}

.child-type {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  background-color: var(--color-bg-primary);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
}

.btn-icon {
  padding: 0.25rem 0.375rem;
  font-size: 0.625rem;
  opacity: 0;
  transition: opacity 0.15s;
}

.child-item:hover .btn-icon {
  opacity: 1;
}

.btn-danger {
  color: var(--color-danger);
  background: transparent;
  border: 1px solid transparent;
}

.btn-danger:hover {
  background-color: var(--color-danger);
  color: white;
  border-color: var(--color-danger);
}
</style>
