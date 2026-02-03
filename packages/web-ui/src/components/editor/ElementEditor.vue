<script setup lang="ts">
/**
 * ElementEditor - Unified editor that renders the appropriate
 * type-specific editor based on the element's modelType.
 */
import { computed } from 'vue';
import PropertyEditor from './PropertyEditor.vue';
import MultiLanguagePropertyEditor from './MultiLanguagePropertyEditor.vue';
import RangeEditor from './RangeEditor.vue';
import FileEditor from './FileEditor.vue';
import BlobEditor from './BlobEditor.vue';
import ReferenceElementEditor from './ReferenceElementEditor.vue';
import SubmodelElementCollectionEditor from './SubmodelElementCollectionEditor.vue';
import JsonViewer from './JsonViewer.vue';

interface SubmodelElement {
  modelType: string;
  idShort: string;
  [key: string]: unknown;
}

const props = defineProps<{
  element: SubmodelElement;
}>();

const emit = defineEmits<{
  (e: 'select-child', path: string, element: SubmodelElement): void;
}>();

const editorComponent = computed(() => {
  switch (props.element.modelType) {
    case 'Property':
      return PropertyEditor;
    case 'MultiLanguageProperty':
      return MultiLanguagePropertyEditor;
    case 'Range':
      return RangeEditor;
    case 'File':
      return FileEditor;
    case 'Blob':
      return BlobEditor;
    case 'ReferenceElement':
      return ReferenceElementEditor;
    case 'SubmodelElementCollection':
      return SubmodelElementCollectionEditor;
    default:
      // Fall back to JSON viewer for unsupported types
      return null;
  }
});

const isSupported = computed(() => editorComponent.value !== null);

function handleSelectChild(path: string, element: SubmodelElement) {
  emit('select-child', path, element);
}
</script>

<template>
  <div class="element-editor">
    <component
      :is="editorComponent"
      v-if="isSupported"
      :element="element"
      @select-child="handleSelectChild"
    />

    <div v-else class="unsupported-type">
      <div class="unsupported-header">
        <span class="unsupported-icon">⚠️</span>
        <span class="unsupported-title">{{ element.modelType }}</span>
      </div>
      <p class="unsupported-message">
        Editor for {{ element.modelType }} is not yet implemented.
        Showing raw JSON below:
      </p>
      <JsonViewer :data="element" :expanded="true" />
    </div>
  </div>
</template>

<style scoped>
.element-editor {
  height: 100%;
}

.unsupported-type {
  padding: 1rem;
}

.unsupported-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.unsupported-icon {
  font-size: 1.5rem;
}

.unsupported-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-warning);
}

.unsupported-message {
  color: var(--color-text-secondary);
  margin-bottom: 1rem;
}
</style>
