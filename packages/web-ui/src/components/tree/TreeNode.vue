<script setup lang="ts">
import { ref } from 'vue';
import { useSelectionStore } from '@/stores/selection';
import { storeToRefs } from 'pinia';

interface TreeNodeData {
  id: string;
  label: string;
  icon: string;
  type?: string;
  data?: unknown;
  path?: string;
  children?: TreeNodeData[];
}

const props = defineProps<{
  node: TreeNodeData;
  depth?: number;
}>();

const emit = defineEmits<{
  select: [node: TreeNodeData];
}>();

const selectionStore = useSelectionStore();
const { selectedId } = storeToRefs(selectionStore);

const isExpanded = ref(true);
const hasChildren = props.node.children && props.node.children.length > 0;
const depth = props.depth || 0;

function toggle() {
  if (hasChildren) {
    isExpanded.value = !isExpanded.value;
  }
}

function handleClick() {
  if (props.node.type && props.node.data) {
    emit('select', props.node);
  }
}
</script>

<template>
  <div class="tree-node" :style="{ '--depth': depth }">
    <div
      :class="['node-content', { 'is-selected': selectedId === node.id }]"
      @click="handleClick"
    >
      <button
        v-if="hasChildren"
        class="toggle-btn"
        @click.stop="toggle"
      >
        {{ isExpanded ? '▼' : '▶' }}
      </button>
      <span v-else class="toggle-spacer"></span>

      <span class="node-icon">{{ node.icon || '•' }}</span>
      <span class="node-label">{{ node.label }}</span>
      <span v-if="node.type" class="node-type">{{ node.type }}</span>
    </div>

    <div v-if="hasChildren && isExpanded" class="node-children">
      <TreeNode
        v-for="child in node.children"
        :key="child.path || child.id"
        :node="child"
        :depth="depth + 1"
        @select="emit('select', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-node {
  user-select: none;
}

.node-content {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  padding-left: calc(var(--depth) * 1rem + 0.5rem);
  border-radius: 0.25rem;
  cursor: pointer;
}

.node-content:hover {
  background-color: var(--color-bg-tertiary);
}

.node-content.is-selected {
  background-color: var(--color-primary);
  color: white;
}

.toggle-btn {
  background: none;
  border: none;
  padding: 0;
  width: 1rem;
  font-size: 0.625rem;
  cursor: pointer;
  color: inherit;
}

.toggle-spacer {
  width: 1rem;
}

.node-icon {
  font-size: 0.875rem;
}

.node-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-type {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  opacity: 0.7;
}

.node-content.is-selected .node-type {
  color: rgba(255, 255, 255, 0.7);
}

.node-children {
  /* Children are indented via padding on content */
}
</style>
