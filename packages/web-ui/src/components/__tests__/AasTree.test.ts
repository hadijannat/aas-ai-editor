/**
 * AasTree Component Smoke Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia, defineStore } from 'pinia';
import { ref, computed } from 'vue';
import AasTree from '../tree/AasTree.vue';

// Create mock stores that work with storeToRefs
const mockEnvironment = ref<Record<string, unknown> | null>(null);

vi.mock('@/stores/document', () => ({
  useDocumentStore: defineStore('document', () => ({
    environment: mockEnvironment,
    isLoaded: computed(() => mockEnvironment.value !== null),
  })),
}));

vi.mock('@/stores/selection', () => ({
  useSelectionStore: defineStore('selection', () => ({
    select: vi.fn(),
    selectedItem: ref(null),
  })),
}));

describe('AasTree', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockEnvironment.value = null;
  });

  it('renders without crashing', () => {
    const wrapper = shallowMount(AasTree);
    expect(wrapper.exists()).toBe(true);
  });

  it('renders empty tree when no environment', () => {
    const wrapper = shallowMount(AasTree);
    expect(wrapper.find('.aas-tree').exists()).toBe(true);
    expect(wrapper.findAllComponents({ name: 'TreeNode' })).toHaveLength(0);
  });

  it('renders AAS section when environment has shells', async () => {
    mockEnvironment.value = {
      assetAdministrationShells: [{ id: 'aas-1', idShort: 'TestAAS' }],
      submodels: [],
    };

    const wrapper = shallowMount(AasTree);
    const nodes = wrapper.findAllComponents({ name: 'TreeNode' });

    // Should have one section for AAS
    expect(nodes.length).toBe(1);
  });

  it('renders submodel section when environment has submodels', async () => {
    mockEnvironment.value = {
      assetAdministrationShells: [],
      submodels: [{ id: 'sm-1', idShort: 'TestSubmodel', submodelElements: [] }],
    };

    const wrapper = shallowMount(AasTree);
    const nodes = wrapper.findAllComponents({ name: 'TreeNode' });

    // Should have one section for submodels
    expect(nodes.length).toBe(1);
  });

  it('renders both sections when environment has both', async () => {
    mockEnvironment.value = {
      assetAdministrationShells: [{ id: 'aas-1', idShort: 'TestAAS' }],
      submodels: [{ id: 'sm-1', idShort: 'TestSubmodel', submodelElements: [] }],
    };

    const wrapper = shallowMount(AasTree);
    const nodes = wrapper.findAllComponents({ name: 'TreeNode' });

    // Should have two sections
    expect(nodes.length).toBe(2);
  });
});
