<script setup lang="ts">
/**
 * ValidationView - Displays validation errors with navigation
 *
 * Features:
 * - Fast (structural) and deep (aas-test-engines) validation
 * - Clickable errors that navigate to the tree element
 * - Quick-fix suggestions for auto-fixable issues
 * - Error/warning categorization
 */
import { ref, computed, onMounted, watch } from 'vue';
import { useDocumentStore } from '@/stores/document';
import { useSelectionStore } from '@/stores/selection';
import { useMcpService } from '@/services/mcp';
import { storeToRefs } from 'pinia';

interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
  category?: string;
  autoFixable?: boolean;
  suggestedFix?: string;
}

interface ValidationResult {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  errors: ValidationError[];
  lastChecked?: string;
}

const documentStore = useDocumentStore();
const selectionStore = useSelectionStore();
const mcpService = useMcpService();

const { isLoaded } = storeToRefs(documentStore);

const isValidating = ref(false);
const validationResult = ref<ValidationResult | null>(null);
const validationType = ref<'fast' | 'deep'>('fast');
const filterSeverity = ref<'all' | 'error' | 'warning'>('all');
const autoFixInProgress = ref<string | null>(null);

// Filtered errors based on severity filter
const filteredErrors = computed(() => {
  if (!validationResult.value) return [];

  if (filterSeverity.value === 'all') {
    return validationResult.value.errors;
  }

  return validationResult.value.errors.filter(
    (e) => e.severity === filterSeverity.value
  );
});

// Group errors by category
const groupedErrors = computed(() => {
  const groups: Record<string, ValidationError[]> = {};

  for (const error of filteredErrors.value) {
    const category = error.category || 'General';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(error);
  }

  return groups;
});

const statusColor = computed(() => {
  if (!validationResult.value) return 'neutral';
  if (validationResult.value.errorCount > 0) return 'error';
  if (validationResult.value.warningCount > 0) return 'warning';
  return 'success';
});

const statusIcon = computed(() => {
  switch (statusColor.value) {
    case 'error':
      return '❌';
    case 'warning':
      return '⚠️';
    case 'success':
      return '✅';
    default:
      return '❓';
  }
});

async function runValidation() {
  if (!isLoaded.value) return;

  isValidating.value = true;

  try {
    const tool = validationType.value === 'fast' ? 'validate_fast' : 'validate_deep';
    const result = await mcpService.callTool(tool, {});

    if (result.success && result.data) {
      // Transform the result into our expected format
      const data = result.data as {
        valid?: boolean;
        errors?: Array<{
          path?: string;
          message?: string;
          severity?: string;
          category?: string;
          autoFixable?: boolean;
        }>;
        warnings?: Array<{
          path?: string;
          message?: string;
        }>;
      };

      const errors: ValidationError[] = [];

      // Add errors
      if (data.errors) {
        for (const e of data.errors) {
          errors.push({
            path: e.path || '/',
            message: e.message || 'Unknown error',
            severity: 'error',
            category: e.category,
            autoFixable: e.autoFixable,
          });
        }
      }

      // Add warnings
      if (data.warnings) {
        for (const w of data.warnings) {
          errors.push({
            path: w.path || '/',
            message: w.message || 'Unknown warning',
            severity: 'warning',
          });
        }
      }

      validationResult.value = {
        valid: data.valid ?? errors.filter((e) => e.severity === 'error').length === 0,
        errorCount: errors.filter((e) => e.severity === 'error').length,
        warningCount: errors.filter((e) => e.severity === 'warning').length,
        errors,
        lastChecked: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error('Validation failed:', err);
    validationResult.value = {
      valid: false,
      errorCount: 1,
      warningCount: 0,
      errors: [
        {
          path: '/',
          message: `Validation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          severity: 'error',
        },
      ],
    };
  } finally {
    isValidating.value = false;
  }
}

function navigateToError(error: ValidationError) {
  // Extract the path and navigate to it in the tree
  // The selection store will update the tree and editor
  selectionStore.select({
    path: error.path,
    type: 'element',
    id: error.path,
    data: { idShort: getIdShortFromPath(error.path) },
  });
}

function getIdShortFromPath(path: string): string {
  // Extract the last segment from a JSON Pointer path
  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] || 'root';
}

async function applyQuickFix(error: ValidationError) {
  if (!error.autoFixable) return;

  autoFixInProgress.value = error.path;

  try {
    // Pass error as array with correct parameter names
    const result = await mcpService.callTool('validate_auto_fix', {
      errors: [{
        path: error.path,
        message: error.message,
        severity: error.severity,
      }],
      maxAttempts: 1,
    });

    if (result.success) {
      await documentStore.refreshState();
      // Re-run validation to update the list
      await runValidation();
    }
  } catch (err) {
    console.error('Auto-fix failed:', err);
  } finally {
    autoFixInProgress.value = null;
  }
}

// Run validation when document changes
watch(isLoaded, (newLoaded) => {
  if (newLoaded) {
    runValidation();
  } else {
    validationResult.value = null;
  }
});

onMounted(() => {
  if (isLoaded.value) {
    runValidation();
  }
});
</script>

<template>
  <div class="validation-view">
    <div class="validation-header">
      <h2>Validation</h2>
      <div class="validation-controls">
        <select v-model="validationType" class="input type-select">
          <option value="fast">Fast (structural)</option>
          <option value="deep">Deep (aas-test-engines)</option>
        </select>
        <button
          class="btn btn-primary"
          :disabled="!isLoaded || isValidating"
          @click="runValidation"
        >
          {{ isValidating ? 'Validating...' : 'Run Validation' }}
        </button>
      </div>
    </div>

    <div v-if="!isLoaded" class="no-document">
      <p>Load a document to run validation.</p>
    </div>

    <div v-else-if="validationResult" class="validation-results">
      <div class="status-card" :class="`status-${statusColor}`">
        <span class="status-icon">{{ statusIcon }}</span>
        <div class="status-info">
          <span class="status-title">
            {{ validationResult.valid ? 'Valid' : 'Issues Found' }}
          </span>
          <span class="status-counts">
            {{ validationResult.errorCount }} error(s),
            {{ validationResult.warningCount }} warning(s)
          </span>
        </div>
        <span v-if="validationResult.lastChecked" class="status-time">
          {{ new Date(validationResult.lastChecked).toLocaleTimeString() }}
        </span>
      </div>

      <div class="filter-bar">
        <label class="filter-label">Show:</label>
        <button
          class="filter-btn"
          :class="{ active: filterSeverity === 'all' }"
          @click="filterSeverity = 'all'"
        >
          All ({{ validationResult.errors.length }})
        </button>
        <button
          class="filter-btn filter-error"
          :class="{ active: filterSeverity === 'error' }"
          @click="filterSeverity = 'error'"
        >
          Errors ({{ validationResult.errorCount }})
        </button>
        <button
          class="filter-btn filter-warning"
          :class="{ active: filterSeverity === 'warning' }"
          @click="filterSeverity = 'warning'"
        >
          Warnings ({{ validationResult.warningCount }})
        </button>
      </div>

      <div v-if="filteredErrors.length === 0" class="no-issues">
        <span class="no-issues-icon">🎉</span>
        <p>No issues found!</p>
      </div>

      <div v-else class="error-groups">
        <div
          v-for="(errors, category) in groupedErrors"
          :key="category"
          class="error-group"
        >
          <h3 class="group-title">{{ category }}</h3>
          <div class="error-list">
            <div
              v-for="(error, index) in errors"
              :key="`${error.path}-${index}`"
              class="error-item"
              :class="`severity-${error.severity}`"
              @click="navigateToError(error)"
            >
              <span class="error-icon">
                {{ error.severity === 'error' ? '❌' : '⚠️' }}
              </span>
              <div class="error-content">
                <span class="error-message">{{ error.message }}</span>
                <code class="error-path">{{ error.path }}</code>
              </div>
              <button
                v-if="error.autoFixable"
                class="btn btn-sm btn-fix"
                :disabled="autoFixInProgress === error.path"
                title="Apply quick fix"
                @click.stop="applyQuickFix(error)"
              >
                {{ autoFixInProgress === error.path ? '...' : '🔧 Fix' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="loading">
      <p>Running validation...</p>
    </div>
  </div>
</template>

<style scoped>
.validation-view {
  padding: 1.5rem;
  max-width: 900px;
  margin: 0 auto;
}

.validation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.validation-header h2 {
  margin: 0;
  font-size: 1.5rem;
}

.validation-controls {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.type-select {
  padding: 0.5rem;
  border-radius: 0.375rem;
  border: 1px solid var(--color-border);
}

.no-document {
  text-align: center;
  padding: 3rem;
  color: var(--color-text-muted);
}

.status-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
}

.status-success {
  background-color: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.status-warning {
  background-color: rgba(234, 179, 8, 0.1);
  border: 1px solid rgba(234, 179, 8, 0.3);
}

.status-error {
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.status-neutral {
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
}

.status-icon {
  font-size: 2rem;
}

.status-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.status-title {
  font-weight: 600;
  font-size: 1.125rem;
}

.status-counts {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.status-time {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.filter-bar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background-color: var(--color-bg-secondary);
  border-radius: 0.375rem;
}

.filter-label {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-right: 0.5rem;
}

.filter-btn {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  background: var(--color-bg-primary);
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.15s;
}

.filter-btn:hover {
  background-color: var(--color-bg-tertiary);
}

.filter-btn.active {
  background-color: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.filter-error.active {
  background-color: var(--color-danger);
  border-color: var(--color-danger);
}

.filter-warning.active {
  background-color: var(--color-warning);
  border-color: var(--color-warning);
  color: black;
}

.no-issues {
  text-align: center;
  padding: 3rem;
  color: var(--color-text-secondary);
}

.no-issues-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: 0.5rem;
}

.error-groups {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.error-group {
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  overflow: hidden;
}

.group-title {
  margin: 0;
  padding: 0.75rem 1rem;
  background-color: var(--color-bg-secondary);
  font-size: 0.875rem;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

.error-list {
  display: flex;
  flex-direction: column;
}

.error-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: background-color 0.15s;
  border-bottom: 1px solid var(--color-border);
}

.error-item:last-child {
  border-bottom: none;
}

.error-item:hover {
  background-color: var(--color-bg-secondary);
}

.error-icon {
  flex-shrink: 0;
  font-size: 1rem;
  padding-top: 0.125rem;
}

.error-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.error-message {
  font-size: 0.875rem;
}

.error-path {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  background-color: var(--color-bg-tertiary);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.severity-error .error-message {
  color: var(--color-danger);
}

.severity-warning .error-message {
  color: var(--color-warning);
}

.btn-fix {
  flex-shrink: 0;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  background-color: var(--color-success);
  color: white;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-fix:hover {
  opacity: 0.9;
}

.btn-fix:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading {
  text-align: center;
  padding: 3rem;
  color: var(--color-text-muted);
}
</style>
