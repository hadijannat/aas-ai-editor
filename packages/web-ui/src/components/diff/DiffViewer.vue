<script setup lang="ts">
import { ref, computed } from 'vue';
import DiffLine from './DiffLine.vue';
import JsonDiff from './JsonDiff.vue';
import {
  type AasPatchOp,
  describeOp,
  formatPath,
  getValueAtPath,
  getPatchDisplay,
} from '@/utils/diff';

interface Props {
  patches: AasPatchOp[];
  document?: unknown;
  collapsed?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: true,
});

interface PatchEntry {
  patch: AasPatchOp;
  description: string;
  formattedPath: string;
  beforeValue?: unknown;
  afterValue?: unknown;
}

const expandedPatches = ref<Set<number>>(new Set());

const entries = computed<PatchEntry[]>(() => {
  return props.patches.map((patch) => {
    const beforeValue =
      patch.op === 'add' ? undefined : getValueAtPath(props.document, patch.path);

    let afterValue: unknown;
    if (patch.op === 'remove') {
      afterValue = undefined;
    } else if (patch.op === 'move' || patch.op === 'copy') {
      afterValue = patch.from ? getValueAtPath(props.document, patch.from) : undefined;
    } else {
      afterValue = patch.value;
    }

    return {
      patch,
      description: describeOp(patch),
      formattedPath: formatPath(patch.path),
      beforeValue,
      afterValue,
    };
  });
});

function toggleExpand(index: number) {
  if (expandedPatches.value.has(index)) {
    expandedPatches.value.delete(index);
  } else {
    expandedPatches.value.add(index);
  }
  // Trigger reactivity
  expandedPatches.value = new Set(expandedPatches.value);
}

function isExpanded(index: number): boolean {
  // If collapsed prop is false, show all expanded by default
  if (!props.collapsed) return true;
  return expandedPatches.value.has(index);
}

function expandAll() {
  expandedPatches.value = new Set(entries.value.map((_, i) => i));
}

function collapseAll() {
  expandedPatches.value = new Set();
}
</script>

<template>
  <div class="diff-viewer">
    <!-- Header with expand/collapse controls -->
    <div class="diff-header">
      <span class="diff-count">{{ patches.length }} change{{ patches.length !== 1 ? 's' : '' }}</span>
      <div class="diff-controls">
        <button class="diff-control-btn" @click="expandAll" title="Expand all">
          <span class="icon">+</span>
        </button>
        <button class="diff-control-btn" @click="collapseAll" title="Collapse all">
          <span class="icon">−</span>
        </button>
      </div>
    </div>

    <!-- Patch entries -->
    <div class="diff-entries">
      <div v-for="(entry, index) in entries" :key="index" class="diff-entry">
        <!-- Summary line (always visible) -->
        <div class="diff-summary" @click="toggleExpand(index)">
          <button class="expand-btn" :class="{ expanded: isExpanded(index) }">
            <span class="chevron">›</span>
          </button>
          <DiffLine
            :type="entry.patch.op"
            :content="entry.description"
            :path="entry.formattedPath"
          />
        </div>

        <!-- Details (when expanded) -->
        <div v-if="isExpanded(index)" class="diff-details">
          <!-- Show reason if available -->
          <div v-if="entry.patch.reason" class="diff-reason">
            <span class="reason-label">Reason:</span>
            {{ entry.patch.reason }}
          </div>

          <!-- Show path -->
          <div class="diff-path-full">
            <span class="path-label">Path:</span>
            <code>{{ entry.patch.path }}</code>
          </div>

          <!-- Show from path for move/copy -->
          <div v-if="entry.patch.from" class="diff-path-full">
            <span class="path-label">From:</span>
            <code>{{ entry.patch.from }}</code>
          </div>

          <!-- Value diff -->
          <div
            v-if="entry.patch.op !== 'test'"
            class="diff-value"
          >
            <span class="value-label">Value:</span>
            <JsonDiff :before="entry.beforeValue" :after="entry.afterValue" :max-depth="3" />
          </div>

          <!-- Metadata -->
          <div class="diff-meta">
            <span v-if="entry.patch.aiGenerated" class="meta-badge ai-badge">AI Generated</span>
            <span v-if="entry.patch.semanticId" class="meta-badge" :title="entry.patch.semanticId">
              {{ entry.patch.idShort || 'Semantic' }}
            </span>
            <span v-if="entry.patch.modelType" class="meta-badge">
              {{ entry.patch.modelType }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="patches.length === 0" class="diff-empty">
      No changes to display
    </div>
  </div>
</template>

<style scoped>
.diff-viewer {
  font-size: 0.875rem;
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 0.5rem;
}

.diff-count {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.diff-controls {
  display: flex;
  gap: 0.25rem;
}

.diff-control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 0.875rem;
}

.diff-control-btn:hover {
  background: var(--color-bg-tertiary);
}

.diff-entries {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.diff-entry {
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  overflow: hidden;
}

.diff-summary {
  display: flex;
  align-items: flex-start;
  cursor: pointer;
  background: var(--color-bg-secondary);
}

.diff-summary:hover {
  background: var(--color-bg-tertiary);
}

.expand-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 100%;
  min-height: 2rem;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: transform 0.15s ease;
}

.expand-btn .chevron {
  font-size: 0.875rem;
  transition: transform 0.15s ease;
}

.expand-btn.expanded .chevron {
  transform: rotate(90deg);
}

.diff-summary :deep(.diff-line) {
  flex: 1;
  border-radius: 0;
}

.diff-details {
  padding: 0.75rem;
  background: var(--color-bg-primary);
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.diff-reason {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.reason-label,
.path-label,
.value-label {
  font-weight: 500;
  color: var(--color-text-muted);
  margin-right: 0.5rem;
}

.diff-path-full {
  font-size: 0.75rem;
}

.diff-path-full code {
  font-family: 'Fira Code', 'Consolas', monospace;
  background: var(--color-bg-tertiary);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
}

.diff-value {
  padding: 0.5rem;
  background: var(--color-bg-secondary);
  border-radius: 0.25rem;
  overflow-x: auto;
}

.diff-meta {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.meta-badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
}

.ai-badge {
  background: var(--color-primary);
  color: white;
}

.diff-empty {
  text-align: center;
  padding: 1rem;
  color: var(--color-text-muted);
  font-style: italic;
}
</style>
