<script setup lang="ts">
import { computed } from 'vue';
import { isPrimitive, formatValue, deepEqual } from '@/utils/diff';

interface Props {
  before?: unknown;
  after?: unknown;
  label?: string;
  depth?: number;
  maxDepth?: number;
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0,
  maxDepth: 4,
});

type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';

interface DiffEntry {
  key: string;
  before?: unknown;
  after?: unknown;
  status: DiffStatus;
}

const diffStatus = computed<DiffStatus>(() => {
  if (props.before === undefined && props.after !== undefined) return 'added';
  if (props.before !== undefined && props.after === undefined) return 'removed';
  if (!deepEqual(props.before, props.after)) return 'modified';
  return 'unchanged';
});

const isExpanded = computed(() => props.depth < props.maxDepth);

const beforeIsPrimitive = computed(() => isPrimitive(props.before));
const afterIsPrimitive = computed(() => isPrimitive(props.after));

const beforeIsArray = computed(() => Array.isArray(props.before));
const afterIsArray = computed(() => Array.isArray(props.after));

const entries = computed<DiffEntry[]>(() => {
  // For primitives, no entries needed
  if (beforeIsPrimitive.value && afterIsPrimitive.value) {
    return [];
  }

  const result: DiffEntry[] = [];
  const beforeObj = (props.before || {}) as Record<string, unknown>;
  const afterObj = (props.after || {}) as Record<string, unknown>;

  // Handle arrays
  if (beforeIsArray.value || afterIsArray.value) {
    const beforeArr = (props.before || []) as unknown[];
    const afterArr = (props.after || []) as unknown[];
    const maxLen = Math.max(beforeArr.length, afterArr.length);

    for (let i = 0; i < maxLen; i++) {
      const bVal = beforeArr[i];
      const aVal = afterArr[i];

      let status: DiffStatus = 'unchanged';
      if (i >= beforeArr.length) status = 'added';
      else if (i >= afterArr.length) status = 'removed';
      else if (!deepEqual(bVal, aVal)) status = 'modified';

      result.push({
        key: String(i),
        before: bVal,
        after: aVal,
        status,
      });
    }
    return result;
  }

  // Handle objects
  const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

  for (const key of allKeys) {
    const bVal = beforeObj[key];
    const aVal = afterObj[key];

    let status: DiffStatus = 'unchanged';
    if (!(key in beforeObj)) status = 'added';
    else if (!(key in afterObj)) status = 'removed';
    else if (!deepEqual(bVal, aVal)) status = 'modified';

    result.push({
      key,
      before: bVal,
      after: aVal,
      status,
    });
  }

  // Sort: modified first, then added, then unchanged, then removed
  const order: Record<DiffStatus, number> = {
    modified: 0,
    added: 1,
    unchanged: 2,
    removed: 3,
  };
  result.sort((a, b) => order[a.status] - order[b.status]);

  return result;
});

function getStatusClass(status: DiffStatus): string {
  switch (status) {
    case 'added':
      return 'json-added';
    case 'removed':
      return 'json-removed';
    case 'modified':
      return 'json-modified';
    default:
      return '';
  }
}
</script>

<template>
  <div class="json-diff" :class="[getStatusClass(diffStatus), { 'json-nested': depth > 0 }]">
    <!-- Label if provided -->
    <span v-if="label" class="json-label">{{ label }}:</span>

    <!-- Primitive values -->
    <template v-if="beforeIsPrimitive && afterIsPrimitive">
      <span v-if="diffStatus === 'modified'" class="json-value">
        <span class="json-before">{{ formatValue(before) }}</span>
        <span class="json-arrow"> → </span>
        <span class="json-after">{{ formatValue(after) }}</span>
      </span>
      <span v-else-if="diffStatus === 'added'" class="json-value json-after">
        {{ formatValue(after) }}
      </span>
      <span v-else-if="diffStatus === 'removed'" class="json-value json-before">
        {{ formatValue(before) }}
      </span>
      <span v-else class="json-value json-unchanged">
        {{ formatValue(before) }}
      </span>
    </template>

    <!-- Complex values (collapsed) -->
    <template v-else-if="!isExpanded">
      <span v-if="diffStatus === 'modified'" class="json-value">
        <span class="json-before">{{ formatValue(before) }}</span>
        <span class="json-arrow"> → </span>
        <span class="json-after">{{ formatValue(after) }}</span>
      </span>
      <span v-else class="json-value">
        {{ formatValue(diffStatus === 'removed' ? before : after) }}
      </span>
    </template>

    <!-- Complex values (expanded) -->
    <template v-else>
      <span class="json-bracket">{{ beforeIsArray || afterIsArray ? '[' : '{' }}</span>
      <div class="json-entries">
        <div
          v-for="entry in entries"
          :key="entry.key"
          :class="['json-entry', getStatusClass(entry.status)]"
        >
          <JsonDiff
            :before="entry.before"
            :after="entry.after"
            :label="entry.key"
            :depth="depth + 1"
            :max-depth="maxDepth"
          />
        </div>
      </div>
      <span class="json-bracket">{{ beforeIsArray || afterIsArray ? ']' : '}' }}</span>
    </template>
  </div>
</template>

<style scoped>
.json-diff {
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 0.8125rem;
  line-height: 1.5;
}

.json-nested {
  padding-left: 1rem;
}

.json-label {
  color: var(--color-text-secondary);
  margin-right: 0.25rem;
}

.json-value {
  word-break: break-word;
}

.json-before {
  color: var(--diff-remove-text);
  text-decoration: line-through;
  opacity: 0.8;
}

.json-after {
  color: var(--diff-add-text);
}

.json-arrow {
  color: var(--color-text-muted);
  margin: 0 0.25rem;
}

.json-unchanged {
  color: var(--color-text-muted);
}

.json-bracket {
  color: var(--color-text-muted);
}

.json-entries {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.json-entry {
  padding: 0.125rem 0;
  border-radius: 0.125rem;
}

.json-entry.json-added {
  background-color: var(--diff-add-bg);
}

.json-entry.json-removed {
  background-color: var(--diff-remove-bg);
}

.json-entry.json-modified {
  background-color: var(--diff-modify-bg);
}
</style>
