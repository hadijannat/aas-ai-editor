<script setup lang="ts">
/**
 * AiSuggestion - Tier 1: Inline AI Suggestion
 *
 * Displays AI-generated suggestions inline with elements.
 * Shows a subtle highlight when AI has a suggestion for the current field.
 */
import { computed } from 'vue';

export interface Suggestion {
  id: string;
  type: 'value' | 'structure' | 'validation';
  message: string;
  confidence: 'high' | 'medium' | 'low';
  patch?: unknown;
}

const props = defineProps<{
  suggestion: Suggestion;
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'accept'): void;
  (e: 'dismiss'): void;
  (e: 'details'): void;
}>();

const confidenceColor = computed(() => {
  switch (props.suggestion.confidence) {
    case 'high':
      return 'confidence-high';
    case 'medium':
      return 'confidence-medium';
    case 'low':
      return 'confidence-low';
    default:
      return '';
  }
});

const typeIcon = computed(() => {
  switch (props.suggestion.type) {
    case 'value':
      return '✏️';
    case 'structure':
      return '🏗️';
    case 'validation':
      return '✅';
    default:
      return '💡';
  }
});
</script>

<template>
  <div class="ai-suggestion" :class="[confidenceColor, { compact }]">
    <div class="suggestion-icon">{{ typeIcon }}</div>
    <div class="suggestion-content">
      <span class="suggestion-message">{{ suggestion.message }}</span>
      <span class="suggestion-badge">AI</span>
    </div>
    <div class="suggestion-actions">
      <button
        class="action-btn accept"
        title="Accept suggestion"
        @click="emit('accept')"
      >
        ✓
      </button>
      <button
        v-if="suggestion.patch"
        class="action-btn details"
        title="View details"
        @click="emit('details')"
      >
        ⋯
      </button>
      <button
        class="action-btn dismiss"
        title="Dismiss"
        @click="emit('dismiss')"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<style scoped>
.ai-suggestion {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(59, 130, 246, 0.08));
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 0.5rem;
  font-size: 0.875rem;
  animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.ai-suggestion.compact {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.confidence-high {
  border-color: rgba(34, 197, 94, 0.3);
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(59, 130, 246, 0.08));
}

.confidence-medium {
  border-color: rgba(234, 179, 8, 0.3);
  background: linear-gradient(135deg, rgba(234, 179, 8, 0.08), rgba(59, 130, 246, 0.08));
}

.confidence-low {
  border-color: rgba(239, 68, 68, 0.3);
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(59, 130, 246, 0.08));
}

.suggestion-icon {
  flex-shrink: 0;
}

.suggestion-content {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.suggestion-message {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.suggestion-badge {
  flex-shrink: 0;
  padding: 0.125rem 0.375rem;
  background: linear-gradient(135deg, #8b5cf6, #3b82f6);
  color: white;
  font-size: 0.625rem;
  font-weight: 600;
  border-radius: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.suggestion-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.action-btn {
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.25rem;
  background: transparent;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.15s;
}

.action-btn:hover {
  background-color: rgba(0, 0, 0, 0.1);
}

.action-btn.accept:hover {
  background-color: rgba(34, 197, 94, 0.2);
  color: rgb(34, 197, 94);
}

.action-btn.dismiss:hover {
  background-color: rgba(239, 68, 68, 0.2);
  color: rgb(239, 68, 68);
}
</style>
