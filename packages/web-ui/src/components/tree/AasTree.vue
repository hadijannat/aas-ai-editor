<script setup lang="ts">
import { computed } from 'vue';
import { useDocumentStore } from '@/stores/document';
import { useSelectionStore } from '@/stores/selection';
import { storeToRefs } from 'pinia';
import TreeNode from './TreeNode.vue';

const documentStore = useDocumentStore();
const selectionStore = useSelectionStore();

const { environment } = storeToRefs(documentStore);

interface AasShell {
  id: string;
  idShort?: string;
}

interface Submodel {
  id: string;
  idShort?: string;
  submodelElements?: unknown[];
}

interface TreeNodeData {
  id: string;
  label: string;
  icon: string;
  type?: string;
  data?: unknown;
  path?: string;
  children?: TreeNodeData[];
}

const treeNodes = computed(() => {
  if (!environment.value) return [];

  const nodes: TreeNodeData[] = [];
  const env = environment.value as {
    assetAdministrationShells?: AasShell[];
    submodels?: Submodel[];
  };

  // Asset Administration Shells
  const shells = env.assetAdministrationShells;
  if (shells && shells.length > 0) {
    nodes.push({
      id: 'aas-section',
      label: 'Asset Administration Shells',
      icon: '🏭',
      children: shells.map((aas, index) => {
        const nodePath = `/assetAdministrationShells/${index}`;
        return {
          id: nodePath, // Use path as unique id instead of aas.id
          label: aas.idShort || aas.id,
          icon: '📋',
          type: 'AssetAdministrationShell',
          data: aas,
          path: nodePath,
        };
      }),
    });
  }

  // Submodels
  const submodels = env.submodels;
  if (submodels && submodels.length > 0) {
    nodes.push({
      id: 'submodel-section',
      label: 'Submodels',
      icon: '📦',
      children: submodels.map((sm, index) => {
        const basePath = `/submodels/${index}`;
        return {
          id: basePath, // Use path as unique id instead of sm.id
          label: sm.idShort || sm.id,
          icon: '📄',
          type: 'Submodel',
          data: sm,
          path: basePath,
          children: buildElementTree(sm.submodelElements || [], `${basePath}/submodelElements`),
        };
      }),
    });
  }

  return nodes;
});

function buildElementTree(elements: unknown[], basePath: string): TreeNodeData[] {
  return elements.map((el: unknown, index: number) => {
    const element = el as { idShort?: string; modelType?: string; value?: unknown[] };
    const elementPath = `${basePath}/${index}`;
    const node: TreeNodeData = {
      id: elementPath, // Use path as unique id to handle duplicate idShorts
      label: element.idShort || 'Unknown',
      icon: getElementIcon(element.modelType),
      type: element.modelType || 'Unknown',
      data: element,
      path: elementPath,
    };

    // Handle collections - nested elements are in the 'value' array
    if (element.modelType === 'SubmodelElementCollection' && Array.isArray(element.value)) {
      node.children = buildElementTree(element.value, `${elementPath}/value`);
    }

    // Handle lists - nested elements are also in 'value'
    if (element.modelType === 'SubmodelElementList' && Array.isArray(element.value)) {
      node.children = buildElementTree(element.value, `${elementPath}/value`);
    }

    return node;
  });
}

function getElementIcon(modelType?: string): string {
  const icons: Record<string, string> = {
    Property: '🔤',
    MultiLanguageProperty: '🌐',
    Range: '📊',
    Blob: '📎',
    File: '📁',
    ReferenceElement: '🔗',
    SubmodelElementCollection: '📂',
    SubmodelElementList: '📋',
    Entity: '🏢',
    Operation: '⚡',
    Capability: '✨',
  };
  return icons[modelType || ''] || '•';
}

function handleSelect(node: TreeNodeData) {
  selectionStore.select({
    type: node.type || 'unknown',
    id: node.id,
    data: node.data,
    path: node.path,
  });
}
</script>

<template>
  <div class="aas-tree">
    <TreeNode
      v-for="node in treeNodes"
      :key="node.id"
      :node="node"
      @select="handleSelect"
    />
  </div>
</template>

<style scoped>
.aas-tree {
  font-size: 0.875rem;
}
</style>
