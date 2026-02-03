<script setup lang="ts">
/**
 * CommandPalette - Tier 2: AI Command Palette
 *
 * Cmd+K / Ctrl+K activated command palette for AI operations.
 * Provides quick access to AI commands without leaving the editor.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useMcpService } from '@/services/mcp';
import { useDocumentStore } from '@/stores/document';
import { useSelectionStore } from '@/stores/selection';

interface Command {
  id: string;
  label: string;
  description: string;
  icon: string;
  category: 'edit' | 'validate' | 'generate' | 'query';
  shortcut?: string;
  action: () => Promise<void>;
}

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'execute', result: unknown): void;
}>();

const mcpService = useMcpService();
const documentStore = useDocumentStore();
const selectionStore = useSelectionStore();

const searchQuery = ref('');
const selectedIndex = ref(0);
const isExecuting = ref(false);
const executionMessage = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

// Define available commands
const commands: Command[] = [
  {
    id: 'validate-fast',
    label: 'Validate Document',
    description: 'Run fast validation on the current document',
    icon: '✅',
    category: 'validate',
    shortcut: 'V',
    action: async () => {
      executionMessage.value = 'Running validation...';
      const result = await mcpService.callTool('validate_fast', {});
      emit('execute', result);
    },
  },
  {
    id: 'validate-deep',
    label: 'Deep Validate',
    description: 'Run thorough validation with aas-test-engines',
    icon: '🔍',
    category: 'validate',
    action: async () => {
      executionMessage.value = 'Running deep validation...';
      const result = await mcpService.callTool('validate_deep', {});
      emit('execute', result);
    },
  },
  {
    id: 'auto-fix',
    label: 'Auto-Fix Errors',
    description: 'Automatically fix validation errors',
    icon: '🔧',
    category: 'validate',
    shortcut: 'F',
    action: async () => {
      executionMessage.value = 'Analyzing errors...';
      // First run validation to get errors
      const validation = await mcpService.callTool('validate_fast', {});
      if (validation.success && validation.data) {
        const data = validation.data as { errors?: unknown[] };
        if (data.errors && data.errors.length > 0) {
          executionMessage.value = 'Generating fixes...';
          const result = await mcpService.callTool('validate_auto_fix', {
            errors: data.errors,
          });
          emit('execute', result);
        } else {
          emit('execute', { success: true, data: { message: 'No errors to fix!' } });
        }
      }
    },
  },
  {
    id: 'self-correct',
    label: 'Self-Correcting Loop',
    description: 'Run validation and auto-fix in a retry loop',
    icon: '🔄',
    category: 'validate',
    action: async () => {
      executionMessage.value = 'Running self-correcting validation...';
      const result = await mcpService.callTool('validate_self_correct', {
        maxRetries: 3,
        applyFixes: false,
      });
      emit('execute', result);
    },
  },
  {
    id: 'suggest-template',
    label: 'Suggest Template',
    description: 'Get IDTA template suggestions for selected submodel',
    icon: '📋',
    category: 'generate',
    action: async () => {
      const selected = selectionStore.selected;
      if (!selected?.path) {
        emit('execute', { success: false, error: 'Select a submodel first' });
        return;
      }
      executionMessage.value = 'Analyzing submodel...';
      const result = await mcpService.callTool('import_suggest_template', {
        submodelPath: selected.path,
      });
      emit('execute', result);
    },
  },
  {
    id: 'list-submodels',
    label: 'List Submodels',
    description: 'Show all submodels in the document',
    icon: '📦',
    category: 'query',
    action: async () => {
      executionMessage.value = 'Listing submodels...';
      const result = await mcpService.callTool('query_list_submodels', {});
      emit('execute', result);
    },
  },
  {
    id: 'find-semantic-id',
    label: 'Find by Semantic ID',
    description: 'Search for elements by semantic ID',
    icon: '🔎',
    category: 'query',
    action: async () => {
      // This would open a secondary prompt for semantic ID input
      // For now, list common ones
      executionMessage.value = 'Searching...';
      const result = await mcpService.callTool('query_find_by_semantic_id', {
        semanticId: 'https://admin-shell.io/idta/',
        partialMatch: true,
      });
      emit('execute', result);
    },
  },
  {
    id: 'undo',
    label: 'Undo',
    description: 'Undo the last operation',
    icon: '↩️',
    category: 'edit',
    shortcut: 'Z',
    action: async () => {
      executionMessage.value = 'Undoing...';
      await documentStore.undo();
      emit('execute', { success: true, data: { message: 'Undone' } });
    },
  },
  {
    id: 'redo',
    label: 'Redo',
    description: 'Redo the last undone operation',
    icon: '↪️',
    category: 'edit',
    shortcut: 'Y',
    action: async () => {
      executionMessage.value = 'Redoing...';
      await documentStore.redo();
      emit('execute', { success: true, data: { message: 'Redone' } });
    },
  },
];

// Filter commands based on search
const filteredCommands = computed(() => {
  if (!searchQuery.value) return commands;

  const query = searchQuery.value.toLowerCase();
  return commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query) ||
      cmd.category.toLowerCase().includes(query)
  );
});

// Group commands by category
const groupedCommands = computed(() => {
  const groups: Record<string, Command[]> = {};
  for (const cmd of filteredCommands.value) {
    if (!groups[cmd.category]) {
      groups[cmd.category] = [];
    }
    groups[cmd.category].push(cmd);
  }
  return groups;
});

const categoryLabels: Record<string, string> = {
  validate: 'Validation',
  edit: 'Edit',
  generate: 'Generate',
  query: 'Query',
};

// Handle keyboard navigation
function handleKeydown(event: KeyboardEvent) {
  if (!props.visible) return;

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      selectedIndex.value = Math.min(selectedIndex.value + 1, filteredCommands.value.length - 1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
      break;
    case 'Enter':
      event.preventDefault();
      executeSelected();
      break;
    case 'Escape':
      emit('close');
      break;
  }
}

async function executeSelected() {
  const command = filteredCommands.value[selectedIndex.value];
  if (!command || isExecuting.value) return;

  isExecuting.value = true;
  try {
    await command.action();
  } catch (error) {
    emit('execute', {
      success: false,
      error: error instanceof Error ? error.message : 'Command failed',
    });
  } finally {
    isExecuting.value = false;
    executionMessage.value = '';
    emit('close');
  }
}

function executeCommand(command: Command) {
  const index = filteredCommands.value.indexOf(command);
  if (index !== -1) {
    selectedIndex.value = index;
    executeSelected();
  }
}

// Reset selection when search changes
watch(searchQuery, () => {
  selectedIndex.value = 0;
});

// Focus input when visible
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      searchQuery.value = '';
      selectedIndex.value = 0;
      setTimeout(() => inputRef.value?.focus(), 50);
    }
  }
);

// Global keyboard listener for Cmd+K / Ctrl+K
onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="palette-overlay" @click.self="emit('close')">
        <div class="palette-container">
          <div class="palette-header">
            <div class="search-wrapper">
              <span class="search-icon">🔍</span>
              <input
                ref="inputRef"
                v-model="searchQuery"
                type="text"
                class="search-input"
                placeholder="Type a command..."
                :disabled="isExecuting"
              />
              <kbd class="shortcut-hint">esc</kbd>
            </div>
          </div>

          <div v-if="isExecuting" class="execution-status">
            <span class="spinner"></span>
            <span>{{ executionMessage }}</span>
          </div>

          <div v-else class="palette-content">
            <template v-for="(cmds, category) in groupedCommands" :key="category">
              <div class="command-group">
                <div class="group-label">{{ categoryLabels[category] || category }}</div>
                <div
                  v-for="command in cmds"
                  :key="command.id"
                  class="command-item"
                  :class="{
                    selected: filteredCommands.indexOf(command) === selectedIndex,
                  }"
                  @click="executeCommand(command)"
                  @mouseenter="selectedIndex = filteredCommands.indexOf(command)"
                >
                  <span class="command-icon">{{ command.icon }}</span>
                  <div class="command-info">
                    <span class="command-label">{{ command.label }}</span>
                    <span class="command-desc">{{ command.description }}</span>
                  </div>
                  <kbd v-if="command.shortcut" class="command-shortcut">
                    {{ command.shortcut }}
                  </kbd>
                </div>
              </div>
            </template>

            <div v-if="filteredCommands.length === 0" class="no-results">
              No commands found for "{{ searchQuery }}"
            </div>
          </div>

          <div class="palette-footer">
            <span class="hint"><kbd>↑↓</kbd> Navigate</span>
            <span class="hint"><kbd>↵</kbd> Execute</span>
            <span class="hint"><kbd>esc</kbd> Close</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.palette-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  z-index: 1000;
}

.palette-container {
  width: 100%;
  max-width: 600px;
  background-color: var(--color-bg-primary);
  border-radius: 0.75rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.palette-header {
  padding: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.search-wrapper {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.search-icon {
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 1.125rem;
  outline: none;
  color: var(--color-text-primary);
}

.search-input::placeholder {
  color: var(--color-text-muted);
}

.shortcut-hint {
  padding: 0.25rem 0.5rem;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-family: inherit;
  color: var(--color-text-muted);
}

.execution-status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem;
  color: var(--color-text-secondary);
}

.spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.palette-content {
  max-height: 400px;
  overflow-y: auto;
  padding: 0.5rem;
}

.command-group {
  margin-bottom: 0.5rem;
}

.group-label {
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.command-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background-color 0.1s;
}

.command-item:hover,
.command-item.selected {
  background-color: var(--color-bg-secondary);
}

.command-item.selected {
  background-color: rgba(139, 92, 246, 0.1);
}

.command-icon {
  flex-shrink: 0;
  font-size: 1.25rem;
}

.command-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.command-label {
  font-weight: 500;
  color: var(--color-text-primary);
}

.command-desc {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-shortcut {
  flex-shrink: 0;
  padding: 0.25rem 0.5rem;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-family: inherit;
}

.no-results {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-muted);
}

.palette-footer {
  display: flex;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--color-border);
  background-color: var(--color-bg-secondary);
}

.hint {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.hint kbd {
  padding: 0.125rem 0.375rem;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  font-family: inherit;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-active .palette-container,
.fade-leave-active .palette-container {
  transition: transform 0.15s ease;
}

.fade-enter-from .palette-container,
.fade-leave-to .palette-container {
  transform: scale(0.95);
}
</style>
