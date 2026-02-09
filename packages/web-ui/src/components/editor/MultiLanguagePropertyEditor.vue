<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useDocumentStore } from '@/stores/document';
import { useSelectionStore } from '@/stores/selection';
import { useMcpService } from '@/services/mcp';
import { storeToRefs } from 'pinia';

interface LangString {
  language: string;
  text: string;
}

interface MultiLanguageProperty {
  modelType: 'MultiLanguageProperty';
  idShort: string;
  value?: LangString[];
  semanticId?: {
    keys?: Array<{ value: string }>;
  };
}

const props = defineProps<{
  element: MultiLanguageProperty;
}>();

const documentStore = useDocumentStore();
const selectionStore = useSelectionStore();
const mcpService = useMcpService();

const { selected } = storeToRefs(selectionStore);

// Track local edits
const localValue = ref<LangString[]>(structuredClone(props.element.value || []));
const isEditing = ref(false);
const isSaving = ref(false);
const newLanguage = ref('');
const newText = ref('');

// Common languages
const commonLanguages = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
];

const hasChanges = computed(() => {
  return JSON.stringify(localValue.value) !== JSON.stringify(props.element.value || []);
});

const semanticId = computed(() => {
  return props.element.semanticId?.keys?.[0]?.value || 'None';
});

watch(
  () => props.element,
  (newElement) => {
    localValue.value = structuredClone(newElement.value || []);
    isEditing.value = false;
  }
);

function addLanguage() {
  if (!newLanguage.value || !newText.value) return;

  // Check if language already exists
  const existing = localValue.value.find(ls => ls.language === newLanguage.value);
  if (existing) {
    existing.text = newText.value;
  } else {
    localValue.value.push({
      language: newLanguage.value,
      text: newText.value,
    });
  }

  newLanguage.value = '';
  newText.value = '';
  isEditing.value = true;
}

function removeLanguage(index: number) {
  localValue.value.splice(index, 1);
  isEditing.value = true;
}

function updateText(index: number, text: string) {
  const item = localValue.value[index];
  if (!item) return;
  item.text = text;
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
    const path = `${elementPath}/value`;

    const result = await mcpService.callTool('edit_update', {
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
  localValue.value = structuredClone(props.element.value || []);
  isEditing.value = false;
}
</script>

<template>
  <div class="mlp-editor panel">
    <div class="property-header">
      <span class="property-icon">🌐</span>
      <span class="property-name">{{ element.idShort }}</span>
      <span class="property-type">MultiLanguageProperty</span>
    </div>

    <div class="property-meta">
      <div class="meta-row">
        <span class="meta-label">Semantic ID:</span>
        <span class="meta-value">{{ semanticId }}</span>
      </div>
    </div>

    <div class="language-list">
      <div
        v-for="(langStr, index) in localValue"
        :key="langStr.language"
        class="language-item"
      >
        <span class="language-code">{{ langStr.language }}</span>
        <input
          :value="langStr.text"
          type="text"
          class="input language-text"
          :disabled="isSaving"
          @input="(e) => updateText(index, (e.target as HTMLInputElement).value)"
        />
        <button
          class="btn btn-icon btn-danger"
          :disabled="isSaving"
          title="Remove"
          @click="removeLanguage(index)"
        >
          ✕
        </button>
      </div>

      <div v-if="localValue.length === 0" class="empty-message">
        No translations defined
      </div>
    </div>

    <div class="add-language">
      <select v-model="newLanguage" class="input language-select">
        <option value="">Select language...</option>
        <option
          v-for="lang in commonLanguages"
          :key="lang.code"
          :value="lang.code"
        >
          {{ lang.name }} ({{ lang.code }})
        </option>
      </select>
      <input
        v-model="newText"
        type="text"
        class="input"
        placeholder="Translation text..."
        :disabled="!newLanguage"
        @keyup.enter="addLanguage"
      />
      <button
        class="btn btn-secondary"
        :disabled="!newLanguage || !newText"
        @click="addLanguage"
      >
        Add
      </button>
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
.mlp-editor {
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

.language-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.language-item {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.language-code {
  min-width: 3rem;
  font-weight: 600;
  font-family: monospace;
  color: var(--color-primary);
}

.language-text {
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

.add-language {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  background-color: var(--color-bg-secondary);
  border-radius: 0.375rem;
  margin-bottom: 1rem;
}

.language-select {
  width: 160px;
}

.add-language .input:not(.language-select) {
  flex: 1;
}

.input {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
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
