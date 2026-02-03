<script setup lang="ts">
/**
 * AiChatPanel - Tier 3: AI Chat/Agent Panel
 *
 * Conversational interface for AI-assisted editing.
 * Connects to Claude API via MCP ai_chat tool for intelligent,
 * context-aware assistance with AAS documents.
 */
import { ref, computed, nextTick, watch } from 'vue';
import { useMcpService } from '@/services/mcp';
import { useDocumentStore } from '@/stores/document';
import { storeToRefs } from 'pinia';

/**
 * Chat message with optional tool call information
 */
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  pending?: boolean;
}

/**
 * Tool call made by the AI during processing
 */
interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  success?: boolean;
}

/**
 * Conversation message format for ai_chat tool
 */
interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
}

defineProps<{
  collapsed?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'suggestion', patches: unknown[]): void;
}>();

const mcpService = useMcpService();
const documentStore = useDocumentStore();
const { isLoaded, filename } = storeToRefs(documentStore);

const messages = ref<Message[]>([]);
const inputValue = ref('');
const isProcessing = ref(false);
const messagesContainer = ref<HTMLElement | null>(null);
const aiAvailable = ref<boolean | null>(null);

// Conversation history for multi-turn context
const conversationHistory = ref<ConversationMessage[]>([]);

// Quick actions for common tasks
const quickActions = [
  { label: 'Validate', icon: '✅', prompt: 'Validate the current document and explain any errors.' },
  { label: 'Summarize', icon: '📋', prompt: 'Summarize the structure and contents of this AAS document.' },
  { label: 'Fix Issues', icon: '🔧', prompt: 'Find and fix any validation issues in the document.' },
  { label: 'Add Element', icon: '➕', prompt: 'Help me add a new submodel element.' },
];

// System context display for the user
const systemContext = computed(() => {
  if (!isLoaded.value) {
    return 'No document is currently loaded.';
  }
  return `Working with: ${filename.value || 'Untitled'}`;
});

/**
 * Send a message to the AI assistant
 */
async function sendMessage(content?: string) {
  const messageContent = content || inputValue.value.trim();
  if (!messageContent || isProcessing.value) return;

  inputValue.value = '';

  // Add user message to display
  const userMessage: Message = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content: messageContent,
    timestamp: new Date(),
  };
  messages.value.push(userMessage);
  await scrollToBottom();

  // Add pending assistant message
  const assistantMessage: Message = {
    id: `msg-${Date.now() + 1}`,
    role: 'assistant',
    content: '',
    timestamp: new Date(),
    pending: true,
    toolCalls: [],
  };
  messages.value.push(assistantMessage);
  await scrollToBottom();

  isProcessing.value = true;

  try {
    // Call the ai_chat tool
    const result = await mcpService.callTool('ai_chat', {
      message: messageContent,
      conversationHistory: conversationHistory.value,
    });

    if (result.success) {
      const data = result.data as {
        response: string;
        toolCalls?: ToolCall[];
        usage?: { inputTokens: number; outputTokens: number };
      };

      assistantMessage.content = data.response;
      assistantMessage.toolCalls = data.toolCalls;
      assistantMessage.pending = false;
      aiAvailable.value = true;

      // Update conversation history for multi-turn
      conversationHistory.value.push({
        role: 'user',
        content: messageContent,
      });
      conversationHistory.value.push({
        role: 'assistant',
        content: data.response,
        toolCalls: data.toolCalls,
      });

      // Check if any tool calls generated pending patches for approval
      if (data.toolCalls) {
        for (const call of data.toolCalls) {
          if (call.result && typeof call.result === 'object') {
            const resultObj = call.result as Record<string, unknown>;
            if (resultObj.pendingPatches && Array.isArray(resultObj.pendingPatches)) {
              emit('suggestion', resultObj.pendingPatches);
            }
          }
        }
      }
    } else {
      // Check if it's an API key error or AI unavailable
      const errorMsg = result.error || 'AI service unavailable';
      if (errorMsg.includes('ANTHROPIC_API_KEY') || errorMsg.includes('AI features require')) {
        aiAvailable.value = false;
        // Fall back to pattern-matching mode
        await processFallbackMessage(messageContent, assistantMessage);
        return;
      } else {
        assistantMessage.content = `Error: ${errorMsg}`;
      }
      assistantMessage.pending = false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // If connection failed, try fallback mode
    if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
      aiAvailable.value = false;
      await processFallbackMessage(messageContent, assistantMessage);
      return;
    }
    assistantMessage.content = `Connection error: ${errorMessage}`;
    assistantMessage.pending = false;
  } finally {
    isProcessing.value = false;
    await scrollToBottom();
  }
}

/**
 * Get fallback help message when AI is not available
 */
function getFallbackHelpMessage(error?: string): string {
  return `⚠️ **AI Assistant Unavailable**

${error ? `_${error}_\n\n` : ''}The AI backend is not configured. You can still use the following tools directly:

**Available Commands** (type in chat):
- "validate" - Check document for errors
- "fix" - Auto-fix validation issues
- "summary" - Get document overview
- "list submodels" - Show all submodels

Or use the quick action buttons below.

_To enable full AI features, set the \`ANTHROPIC_API_KEY\` environment variable on the server._`;
}

/**
 * Fallback processing for when AI is unavailable
 * Uses the old pattern-matching approach
 */
async function processFallbackMessage(content: string, assistantMessage: Message): Promise<void> {
  const lowerContent = content.toLowerCase();

  if (lowerContent.includes('validate') || lowerContent.includes('check')) {
    await handleValidationFallback(assistantMessage);
  } else if (lowerContent.includes('fix') || lowerContent.includes('repair')) {
    await handleAutoFixFallback(assistantMessage);
  } else if (lowerContent.includes('summar') || lowerContent.includes('overview')) {
    await handleSummaryFallback(assistantMessage);
  } else if (lowerContent.includes('list') && lowerContent.includes('submodel')) {
    await handleListSubmodelsFallback(assistantMessage);
  } else {
    assistantMessage.content = getFallbackHelpMessage();
  }
  assistantMessage.pending = false;
}

/**
 * Fallback validation handler
 */
async function handleValidationFallback(assistantMessage: Message): Promise<void> {
  if (!isLoaded.value) {
    assistantMessage.content = 'Please load a document first.';
    return;
  }

  const toolCall: ToolCall = { name: 'validate_fast', input: {} };
  assistantMessage.toolCalls = [toolCall];

  const result = await mcpService.callTool('validate_fast', {});
  toolCall.result = result.data;
  toolCall.success = result.success;

  if (!result.success) {
    assistantMessage.content = `Validation failed: ${result.error}`;
    return;
  }

  const data = result.data as {
    valid: boolean;
    errorCount: number;
    warningCount: number;
    errors?: Array<{ path: string; message: string }>;
  };

  if (data.valid) {
    assistantMessage.content = `✅ **Document is valid!**\n\nNo errors found.${data.warningCount > 0 ? ` ${data.warningCount} warning(s) to review.` : ''}`;
  } else {
    let response = `❌ **Found ${data.errorCount} error(s)** and ${data.warningCount} warning(s).\n\n`;
    if (data.errors?.length) {
      response += '**Errors:**\n';
      for (const err of data.errors.slice(0, 5)) {
        response += `- \`${err.path}\`: ${err.message}\n`;
      }
      if (data.errors.length > 5) {
        response += `\n...and ${data.errors.length - 5} more.\n`;
      }
    }
    assistantMessage.content = response;
  }
}

/**
 * Fallback auto-fix handler
 */
async function handleAutoFixFallback(assistantMessage: Message): Promise<void> {
  if (!isLoaded.value) {
    assistantMessage.content = 'Please load a document first.';
    return;
  }

  // First validate
  const validateCall: ToolCall = { name: 'validate_fast', input: {} };
  assistantMessage.toolCalls = [validateCall];

  const validation = await mcpService.callTool('validate_fast', {});
  validateCall.result = validation.data;
  validateCall.success = validation.success;

  if (!validation.success) {
    assistantMessage.content = `Validation failed: ${validation.error}`;
    return;
  }

  const validationData = validation.data as { errors?: unknown[]; valid: boolean };
  if (validationData.valid || !validationData.errors?.length) {
    assistantMessage.content = '✅ No errors to fix!';
    return;
  }

  // Run auto-fix
  const fixCall: ToolCall = { name: 'validate_auto_fix', input: { errors: validationData.errors } };
  assistantMessage.toolCalls.push(fixCall);

  const fixResult = await mcpService.callTool('validate_auto_fix', { errors: validationData.errors });
  fixCall.result = fixResult.data;
  fixCall.success = fixResult.success;

  if (!fixResult.success) {
    assistantMessage.content = `Auto-fix failed: ${fixResult.error}`;
    return;
  }

  const fixData = fixResult.data as {
    summary: { fixable: number; unfixable: number };
    pendingPatches: unknown[];
  };

  let response = `🔧 **Auto-fix Analysis**\n\n`;
  response += `- Fixable: ${fixData.summary.fixable}\n`;
  response += `- Manual fix needed: ${fixData.summary.unfixable}\n\n`;

  if (fixData.pendingPatches.length > 0) {
    response += `Generated ${fixData.pendingPatches.length} fix(es). Review in approval panel.`;
    emit('suggestion', fixData.pendingPatches);
  }

  assistantMessage.content = response;
}

/**
 * Fallback summary handler
 */
async function handleSummaryFallback(assistantMessage: Message): Promise<void> {
  if (!isLoaded.value) {
    assistantMessage.content = 'Please load a document first.';
    return;
  }

  const toolCall: ToolCall = { name: 'validate_summary', input: {} };
  assistantMessage.toolCalls = [toolCall];

  const result = await mcpService.callTool('validate_summary', {});
  toolCall.result = result.data;
  toolCall.success = result.success;

  if (!result.success) {
    assistantMessage.content = `Failed to get summary: ${result.error}`;
    return;
  }

  const data = result.data as {
    aasCount: number;
    submodelCount: number;
    errorCount: number;
    warningCount: number;
  };

  assistantMessage.content = `📊 **Document Summary**\n\n- AAS: ${data.aasCount}\n- Submodels: ${data.submodelCount}\n- Errors: ${data.errorCount}\n- Warnings: ${data.warningCount}`;
}

/**
 * Fallback list submodels handler
 */
async function handleListSubmodelsFallback(assistantMessage: Message): Promise<void> {
  if (!isLoaded.value) {
    assistantMessage.content = 'Please load a document first.';
    return;
  }

  const toolCall: ToolCall = { name: 'query_list_submodels', input: {} };
  assistantMessage.toolCalls = [toolCall];

  const result = await mcpService.callTool('query_list_submodels', {});
  toolCall.result = result.data;
  toolCall.success = result.success;

  if (!result.success) {
    assistantMessage.content = `Failed to list submodels: ${result.error}`;
    return;
  }

  const data = result.data as {
    submodels: Array<{ idShort: string; id: string; semanticId?: string; elementCount: number }>;
  };

  if (!data.submodels?.length) {
    assistantMessage.content = 'No submodels found.';
    return;
  }

  let response = `📦 **Submodels** (${data.submodels.length})\n\n`;
  for (const sm of data.submodels) {
    response += `### ${sm.idShort}\n- ID: \`${sm.id}\`\n`;
    if (sm.semanticId) response += `- Semantic ID: \`${sm.semanticId}\`\n`;
    response += `- Elements: ${sm.elementCount}\n\n`;
  }
  assistantMessage.content = response;
}

/**
 * Handle quick action button click
 */
function handleQuickAction(action: (typeof quickActions)[number]) {
  sendMessage(action.prompt);
}

/**
 * Scroll messages container to bottom
 */
async function scrollToBottom() {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}

/**
 * Clear chat history
 */
function clearChat() {
  messages.value = [];
  conversationHistory.value = [];
  addWelcomeMessage();
}

/**
 * Add welcome message
 */
function addWelcomeMessage() {
  messages.value.push({
    id: 'welcome',
    role: 'assistant',
    content: `🤖 **AAS AI Assistant**

I can help you understand, validate, and edit your AAS documents. Try:

- **Validate** - Check for errors and warnings
- **Summarize** - Get an overview of the document structure
- **Fix issues** - Automatically fix validation errors
- **Ask questions** - "What submodels are in this document?"

Just type your question or use the quick actions below!`,
    timestamp: new Date(),
  });
}

// Watch for ai_chat availability on first use
watch(aiAvailable, (available) => {
  if (available === false) {
    // AI is not available, update welcome message
    const welcomeMsg = messages.value.find((m) => m.id === 'welcome');
    if (welcomeMsg) {
      welcomeMsg.content = getFallbackHelpMessage();
    }
  }
});

// Initialize with welcome message
if (messages.value.length === 0) {
  addWelcomeMessage();
}
</script>

<template>
  <div class="ai-chat-panel" :class="{ collapsed }">
    <div class="panel-header" @click="emit('toggle')">
      <div class="header-title">
        <span class="ai-icon">🤖</span>
        <span>AI Assistant</span>
        <span v-if="aiAvailable === false" class="ai-status offline" title="AI backend unavailable">
          ⚠️
        </span>
      </div>
      <button class="toggle-btn">
        {{ collapsed ? '▲' : '▼' }}
      </button>
    </div>

    <template v-if="!collapsed">
      <div class="panel-context">
        <span class="context-text">{{ systemContext }}</span>
      </div>

      <div ref="messagesContainer" class="messages-container">
        <div
          v-for="message in messages"
          :key="message.id"
          class="message"
          :class="[`message-${message.role}`, { pending: message.pending }]"
        >
          <div class="message-content" v-html="formatMessage(message.content)"></div>

          <div v-if="message.toolCalls?.length" class="tool-calls">
            <div v-for="(call, index) in message.toolCalls" :key="index" class="tool-call">
              <span class="tool-icon">
                {{ call.success === undefined ? '⏳' : call.success ? '✅' : '❌' }}
              </span>
              <span class="tool-name">{{ call.name }}</span>
            </div>
          </div>
        </div>

        <div v-if="isProcessing" class="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>

      <div v-if="messages.length <= 1" class="quick-actions">
        <button
          v-for="action in quickActions"
          :key="action.label"
          class="quick-action"
          @click="handleQuickAction(action)"
        >
          <span class="action-icon">{{ action.icon }}</span>
          <span class="action-label">{{ action.label }}</span>
        </button>
      </div>

      <div class="input-container">
        <input
          id="ai-chat-input"
          v-model="inputValue"
          name="ai-chat-input"
          type="text"
          class="chat-input"
          placeholder="Ask about your document..."
          autocomplete="off"
          :disabled="isProcessing"
          @keydown.enter="sendMessage()"
        />
        <button
          class="send-btn"
          :disabled="!inputValue.trim() || isProcessing"
          @click="sendMessage()"
        >
          ↵
        </button>
        <button class="clear-btn" title="Clear chat" @click="clearChat">🗑️</button>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
// Helper function for formatting markdown-like content
function formatMessage(content: string): string {
  return content
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/###\s+(.+)/g, '<h4>$1</h4>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

export { formatMessage };
</script>

<style scoped>
.ai-chat-panel {
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  overflow: hidden;
  height: 100%;
}

.ai-chat-panel.collapsed {
  height: auto;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.1));
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}

.ai-icon {
  font-size: 1.25rem;
}

.ai-status.offline {
  font-size: 0.875rem;
  opacity: 0.8;
}

.toggle-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-secondary);
}

.panel-context {
  padding: 0.5rem 1rem;
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.context-text {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.message {
  max-width: 90%;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  font-size: 0.875rem;
  line-height: 1.5;
}

.message-user {
  align-self: flex-end;
  background: linear-gradient(135deg, #8b5cf6, #3b82f6);
  color: white;
}

.message-assistant {
  align-self: flex-start;
  background-color: var(--color-bg-secondary);
}

.message-assistant.pending {
  opacity: 0.7;
}

.message-content :deep(code) {
  padding: 0.125rem 0.375rem;
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 0.25rem;
  font-size: 0.8em;
}

.message-content :deep(strong) {
  font-weight: 600;
}

.message-content :deep(em) {
  font-style: italic;
  opacity: 0.85;
}

.message-content :deep(h4) {
  margin: 0.5rem 0;
  font-size: 0.9em;
  font-weight: 600;
}

.tool-calls {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tool-call {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 0.25rem;
  font-size: 0.75rem;
}

.typing-indicator {
  display: flex;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  align-self: flex-start;
}

.typing-indicator span {
  width: 0.5rem;
  height: 0.5rem;
  background-color: var(--color-text-muted);
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(1) {
  animation-delay: -0.32s;
}

.typing-indicator span:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes bounce {
  0%,
  80%,
  100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--color-border);
}

.quick-action {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.75rem;
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 1rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.quick-action:hover {
  background-color: var(--color-bg-tertiary);
  border-color: var(--color-primary);
}

.input-container {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--color-border);
  background-color: var(--color-bg-secondary);
}

.chat-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background-color: var(--color-bg-primary);
}

.chat-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.send-btn {
  padding: 0.5rem 0.75rem;
  background: linear-gradient(135deg, #8b5cf6, #3b82f6);
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-weight: 600;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.clear-btn {
  padding: 0.5rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  cursor: pointer;
}

.clear-btn:hover {
  background-color: var(--color-bg-tertiary);
}
</style>
