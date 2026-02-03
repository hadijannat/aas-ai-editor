/**
 * Selection Store
 *
 * Manages the currently selected element in the editor.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface Selection {
  type: string;
  id: string;
  data: unknown;
  path?: string;
}

export const useSelectionStore = defineStore('selection', () => {
  // State
  const selected = ref<Selection | null>(null);

  // Computed
  // Use path as the primary identifier for selection matching (handles duplicate idShorts)
  const selectedId = computed(() => selected.value?.path ?? selected.value?.id ?? null);
  const selectedType = computed(() => selected.value?.type ?? null);
  const hasSelection = computed(() => selected.value !== null);

  // Actions
  function select(selection: Selection) {
    selected.value = selection;
  }

  function clear() {
    selected.value = null;
  }

  return {
    // State
    selected,

    // Computed
    selectedId,
    selectedType,
    hasSelection,

    // Actions
    select,
    clear,
  };
});
