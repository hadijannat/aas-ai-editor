<script setup lang="ts">
/**
 * AiChatPanel - Tier 3: AI Chat/Agent Panel
 *
 * Conversational interface for AI-assisted editing.
 * Supports natural language queries and multi-turn conversations.
 */
import { ref, computed, watch, nextTick } from 'vue';
import { useMcpService } from '@/services/mcp';
import { useDocumentStore } from '@/stores/document';
import { storeToRefs } from 'pinia';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  pending?: boolean;
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'success' | 'error';
}

const props = defineProps<{
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

// Quick actions for common tasks
const quickActions = [
  { label: 'Validate', icon: '✅', prompt: 'Validate the current document and explain any errors.' },
  { label: 'Summarize', icon: '📋', prompt: 'Summarize the structure and contents of this AAS document.' },
  { label: 'Fix Issues', icon: '🔧', prompt: 'Find and fix any validation issues in the document.' },
  { label: 'Add Element', icon: '➕', prompt: 'Help me add a new submodel element.' },
];

// System context for the AI
const systemContext = computed(() => {
  if (!isLoaded.value) {
    return 'No document is currently loaded.';
  }
  return `Working with AAS document: ${filename.value || 'Untitled'}`;
});

async function sendMessage(content?: string) {
  const messageContent = content || inputValue.value.trim();
  if (!messageContent || isProcessing.value) return;

  inputValue.value = '';
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
    // Process the message and determine what tools to call
    const response = await processUserMessage(messageContent, assistantMessage);
    assistantMessage.content = response;
    assistantMessage.pending = false;
  } catch (error) {
    assistantMessage.content = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    assistantMessage.pending = false;
  } finally {
    isProcessing.value = false;
    await scrollToBottom();
  }
}

async function processUserMessage(content: string, assistantMessage: Message): Promise<string> {
  const lowerContent = content.toLowerCase();

  // Pattern matching for common intents
  if (lowerContent.includes('validate') || lowerContent.includes('check')) {
    return await handleValidation(assistantMessage);
  }

  if (lowerContent.includes('fix') || lowerContent.includes('repair')) {
    return await handleAutoFix(assistantMessage);
  }

  if (lowerContent.includes('summar') || lowerContent.includes('overview')) {
    return await handleSummary(assistantMessage);
  }

  if (lowerContent.includes('list') && lowerContent.includes('submodel')) {
    return await handleListSubmodels(assistantMessage);
  }

  if (lowerContent.includes('help')) {
    return getHelpMessage();
  }

  // Default: provide helpful guidance
  return `I can help you with:
- **Validate**: Check your document for errors
- **Fix**: Automatically fix validation issues
- **Summarize**: Get an overview of the document
- **List submodels**: See all submodels

Try asking something like "validate the document" or "fix any errors".`;
}

async function handleValidation(assistantMessage: Message): Promise<string> {
  if (!isLoaded.value) {
    return 'Please load a document first to run validation.';
  }

  const toolCall: ToolCall = {
    name: 'validate_fast',
    args: {},
    status: 'pending',
  };
  assistantMessage.toolCalls = [toolCall];

  const result = await mcpService.callTool('validate_fast', {});
  toolCall.result = result.data;
  toolCall.status = result.success ? 'success' : 'error';

  if (!result.success) {
    return `Validation failed: ${result.error}`;
  }

  const data = result.data as {
    valid: boolean;
    errorCount: number;
    warningCount: number;
    errors?: Array<{ path: string; message: string }>;
    warnings?: Array<{ path: string; message: string }>;
  };

  if (data.valid) {
    return `✅ **Document is valid!**\n\nNo errors found. ${data.warningCount > 0 ? `There are ${data.warningCount} warning(s) to review.` : ''}`;
  }

  let response = `❌ **Validation found ${data.errorCount} error(s)** and ${data.warningCount} warning(s).\n\n`;

  if (data.errors && data.errors.length > 0) {
    response += '**Errors:**\n';
    for (const error of data.errors.slice(0, 5)) {
      response += `- \`${error.path}\`: ${error.message}\n`;
    }
    if (data.errors.length > 5) {
      response += `\n...and ${data.errors.length - 5} more.\n`;
    }
  }

  response += '\nWould you like me to try to **fix** these automatically?';
  return response;
}

async function handleAutoFix(assistantMessage: Message): Promise<string> {
  if (!isLoaded.value) {
    return 'Please load a document first.';
  }

  // First validate to get errors
  const validateCall: ToolCall = {
    name: 'validate_fast',
    args: {},
    status: 'pending',
  };
  assistantMessage.toolCalls = [validateCall];

  const validation = await mcpService.callTool('validate_fast', {});
  validateCall.result = validation.data;
  validateCall.status = validation.success ? 'success' : 'error';

  if (!validation.success) {
    return `Failed to validate: ${validation.error}`;
  }

  const validationData = validation.data as { errors?: unknown[]; valid: boolean };
  if (validationData.valid || !validationData.errors?.length) {
    return '✅ No errors to fix! The document is already valid.';
  }

  // Run auto-fix
  const fixCall: ToolCall = {
    name: 'validate_auto_fix',
    args: { errors: validationData.errors },
    status: 'pending',
  };
  assistantMessage.toolCalls.push(fixCall);

  const fixResult = await mcpService.callTool('validate_auto_fix', {
    errors: validationData.errors,
  });
  fixCall.result = fixResult.data;
  fixCall.status = fixResult.success ? 'success' : 'error';

  if (!fixResult.success) {
    return `Auto-fix failed: ${fixResult.error}`;
  }

  const fixData = fixResult.data as {
    summary: { fixable: number; unfixable: number };
    pendingPatches: unknown[];
    remainingErrors: unknown[];
    message: string;
  };

  let response = `🔧 **Auto-fix Analysis**\n\n`;
  response += `- Fixable: ${fixData.summary.fixable}\n`;
  response += `- Requires manual fix: ${fixData.summary.unfixable}\n\n`;

  if (fixData.pendingPatches.length > 0) {
    response += `I've generated ${fixData.pendingPatches.length} fix(es). `;
    response += 'Review them in the approval panel before applying.\n\n';
    emit('suggestion', fixData.pendingPatches);
  }

  if (fixData.remainingErrors.length > 0) {
    response += `⚠️ ${fixData.remainingErrors.length} error(s) need manual attention.`;
  }

  return response;
}

async function handleSummary(assistantMessage: Message): Promise<string> {
  if (!isLoaded.value) {
    return 'Please load a document first.';
  }

  const toolCall: ToolCall = {
    name: 'validate_summary',
    args: {},
    status: 'pending',
  };
  assistantMessage.toolCalls = [toolCall];

  const result = await mcpService.callTool('validate_summary', {});
  toolCall.result = result.data;
  toolCall.status = result.success ? 'success' : 'error';

  if (!result.success) {
    return `Failed to get summary: ${result.error}`;
  }

  const data = result.data as {
    aasCount: number;
    submodelCount: number;
    validSubmodels: number;
    errorCount: number;
    warningCount: number;
    submodelSummary: Array<{
      idShort: string;
      semanticId?: string;
      valid: boolean;
      errors: number;
    }>;
  };

  let response = `📊 **Document Summary**\n\n`;
  response += `- **AAS**: ${data.aasCount}\n`;
  response += `- **Submodels**: ${data.submodelCount} (${data.validSubmodels} valid)\n`;
  response += `- **Errors**: ${data.errorCount}\n`;
  response += `- **Warnings**: ${data.warningCount}\n\n`;

  if (data.submodelSummary.length > 0) {
    response += '**Submodels:**\n';
    for (const sm of data.submodelSummary) {
      const status = sm.valid ? '✅' : '❌';
      response += `- ${status} ${sm.idShort}`;
      if (sm.semanticId) {
        const shortId = sm.semanticId.split('/').pop();
        response += ` (${shortId})`;
      }
      if (!sm.valid) {
        response += ` - ${sm.errors} error(s)`;
      }
      response += '\n';
    }
  }

  return response;
}

async function handleListSubmodels(assistantMessage: Message): Promise<string> {
  if (!isLoaded.value) {
    return 'Please load a document first.';
  }

  const toolCall: ToolCall = {
    name: 'query_list_submodels',
    args: {},
    status: 'pending',
  };
  assistantMessage.toolCalls = [toolCall];

  const result = await mcpService.callTool('query_list_submodels', {});
  toolCall.result = result.data;
  toolCall.status = result.success ? 'success' : 'error';

  if (!result.success) {
    return `Failed to list submodels: ${result.error}`;
  }

  const data = result.data as {
    submodels: Array<{
      idShort: string;
      id: string;
      semanticId?: string;
      elementCount: number;
    }>;
  };

  if (!data.submodels?.length) {
    return 'No submodels found in the document.';
  }

  let response = `📦 **Submodels** (${data.submodels.length})\n\n`;
  for (const sm of data.submodels) {
    response += `### ${sm.idShort}\n`;
    response += `- ID: \`${sm.id}\`\n`;
    if (sm.semanticId) {
      response += `- Semantic ID: \`${sm.semanticId}\`\n`;
    }
    response += `- Elements: ${sm.elementCount}\n\n`;
  }

  return response;
}

function getHelpMessage(): string {
  return `🤖 **AAS AI Assistant**

I can help you work with your AAS documents. Try:

**Validation**
- "Validate the document"
- "Check for errors"
- "Fix any issues"

**Queries**
- "Summarize the document"
- "List all submodels"

**Editing**
- "Add a new property"
- "Help me create a submodel"

Just type your request and I'll help!`;
}

function handleQuickAction(action: (typeof quickActions)[number]) {
  sendMessage(action.prompt);
}

async function scrollToBottom() {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}

function clearChat() {
  messages.value = [];
}

// Add welcome message on mount
if (messages.value.length === 0) {
  messages.value.push({
    id: 'welcome',
    role: 'assistant',
    content: getHelpMessage(),
    timestamp: new Date(),
  });
}
</script>

<template>
  <div class="ai-chat-panel" :class="{ collapsed }">
    <div class="panel-header" @click="emit('toggle')">
      <div class="header-title">
        <span class="ai-icon">🤖</span>
        <span>AI Assistant</span>
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
                {{ call.status === 'pending' ? '⏳' : call.status === 'success' ? '✅' : '❌' }}
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
          v-model="inputValue"
          type="text"
          class="chat-input"
          placeholder="Ask about your document..."
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
