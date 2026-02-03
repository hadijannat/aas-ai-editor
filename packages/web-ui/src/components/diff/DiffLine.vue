<script setup lang="ts">
import { computed } from 'vue';
import { getPatchDisplay, type AasPatchOp } from '@/utils/diff';

interface Props {
  type: AasPatchOp['op'];
  content: string;
  path?: string;
}

const props = defineProps<Props>();

const display = computed(() => getPatchDisplay(props.type));
</script>

<template>
  <div :class="['diff-line', display.colorClass]">
    <span class="diff-icon">{{ display.icon }}</span>
    <span class="diff-content">{{ content }}</span>
    <span v-if="path" class="diff-path" :title="path">{{ path }}</span>
  </div>
</template>

<style scoped>
.diff-line {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 0.8125rem;
  line-height: 1.4;
  border-radius: 0.25rem;
}

.diff-icon {
  flex-shrink: 0;
  width: 1rem;
  text-align: center;
  font-weight: 600;
}

.diff-content {
  flex: 1;
  word-break: break-word;
}

.diff-path {
  flex-shrink: 0;
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Operation type colors */
.diff-add {
  background-color: var(--diff-add-bg);
  color: var(--diff-add-text);
}

.diff-remove {
  background-color: var(--diff-remove-bg);
  color: var(--diff-remove-text);
}

.diff-modify {
  background-color: var(--diff-modify-bg);
  color: var(--diff-modify-text);
}

.diff-move {
  background-color: var(--diff-move-bg);
  color: var(--diff-move-text);
}

.diff-test {
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}
</style>
