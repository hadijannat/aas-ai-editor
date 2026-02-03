<script setup lang="ts">
import { ref } from 'vue';
import { useDocumentStore } from '@/stores/document';
import { storeToRefs } from 'pinia';
import { DiffViewer } from '@/components/diff';

const documentStore = useDocumentStore();
const { pendingOperations, environment } = storeToRefs(documentStore);

const expandedOps = ref<Set<string>>(new Set());

function toggleExpand(id: string) {
  if (expandedOps.value.has(id)) {
    expandedOps.value.delete(id);
  } else {
    expandedOps.value.add(id);
  }
  expandedOps.value = new Set(expandedOps.value);
}

function isExpanded(id: string): boolean {
  return expandedOps.value.has(id);
}

function getTierLabel(tier: number): string {
  const labels: Record<number, string> = {
    1: 'LOW',
    2: 'MEDIUM',
    3: 'HIGH',
    4: 'CRITICAL',
  };
  return labels[tier] || 'UNKNOWN';
}

function getTierClass(tier: number): string {
  const classes: Record<number, string> = {
    1: 'tier-low',
    2: 'tier-medium',
    3: 'tier-high',
    4: 'tier-critical',
  };
  return classes[tier] || '';
}

async function approveAll() {
  await documentStore.approveOperations(pendingOperations.value.map((o) => o.id));
}

async function rejectAll() {
  await documentStore.rejectOperations(pendingOperations.value.map((o) => o.id));
}

async function approve(id: string) {
  await documentStore.approveOperations([id]);
}

async function reject(id: string) {
  await documentStore.rejectOperations([id]);
}
</script>

<template>
  <div class="approval-panel">
    <div class="panel-header">
      <h3>Pending Approvals</h3>
      <span class="count-badge">{{ pendingOperations.length }}</span>
    </div>

    <div class="operations-list">
      <div
        v-for="op in pendingOperations"
        :key="op.id"
        class="operation-card"
      >
        <div class="operation-header">
          <span :class="['tier-badge', getTierClass(op.tier)]">
            {{ getTierLabel(op.tier) }}
          </span>
          <span class="operation-tool">{{ op.toolName }}</span>
          <button
            class="expand-toggle"
            :class="{ expanded: isExpanded(op.id) }"
            @click="toggleExpand(op.id)"
            :title="isExpanded(op.id) ? 'Hide diff' : 'Show diff'"
          >
            <span class="chevron">›</span>
          </button>
        </div>

        <p class="operation-reason">{{ op.reason }}</p>

        <!-- Diff Viewer -->
        <div v-if="isExpanded(op.id) && op.patches?.length" class="operation-diff">
          <DiffViewer
            :patches="op.patches"
            :document="environment"
            :collapsed="false"
          />
        </div>

        <div class="operation-actions">
          <button class="btn btn-primary btn-sm" @click="approve(op.id)">
            Approve
          </button>
          <button class="btn btn-secondary btn-sm" @click="reject(op.id)">
            Reject
          </button>
        </div>
      </div>
    </div>

    <div v-if="pendingOperations.length > 1" class="bulk-actions">
      <button class="btn btn-primary" @click="approveAll">
        Approve All
      </button>
      <button class="btn btn-danger" @click="rejectAll">
        Reject All
      </button>
    </div>
  </div>
</template>

<style scoped>
.approval-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.panel-header h3 {
  margin: 0;
  font-size: 1rem;
}

.count-badge {
  background-color: var(--color-primary);
  color: white;
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
}

.operations-list {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.operation-card {
  padding: 0.75rem;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
}

.operation-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.tier-badge {
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  text-transform: uppercase;
}

.operation-tool {
  flex: 1;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.expand-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: transform 0.15s ease;
}

.expand-toggle:hover {
  color: var(--color-text-primary);
}

.expand-toggle .chevron {
  font-size: 0.875rem;
  transition: transform 0.15s ease;
}

.expand-toggle.expanded .chevron {
  transform: rotate(90deg);
}

.operation-diff {
  margin: 0.5rem 0;
  padding: 0.5rem;
  background: var(--color-bg-tertiary);
  border-radius: 0.25rem;
  max-height: 300px;
  overflow-y: auto;
}

.operation-reason {
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.operation-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.bulk-actions {
  display: flex;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}
</style>
