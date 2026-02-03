/**
 * AI Chat Tool
 *
 * Connects the AI chat panel to Claude API for intelligent,
 * context-aware assistance with AAS documents.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  Tool,
  ToolUseBlock,
  ToolResultBlockParam,
  ContentBlock,
} from '@anthropic-ai/sdk/resources/messages';
import type { ToolDefinition, ToolResult, ToolContext, SessionData } from '../types.js';
import type { Environment } from '@aas-ai-editor/core';

/**
 * Maximum tool calls per conversation turn to prevent infinite loops
 */
const MAX_TOOL_CALLS = 10;

/**
 * Tools excluded from AI access (to prevent recursion)
 */
const EXCLUDED_TOOLS = new Set(['ai_chat']);

/**
 * Conversation message for history
 */
interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{
    name: string;
    input: Record<string, unknown>;
    result?: unknown;
  }>;
}

/**
 * Build system prompt with document context
 */
function buildSystemPrompt(session: SessionData): string {
  const parts: string[] = [
    `You are an AI assistant specialized in editing Asset Administration Shell (AAS) packages.`,
    `You help users understand, validate, and modify their AAS documents.`,
    '',
    '## Your Capabilities',
    '- Query document structure and content',
    '- Validate documents for errors and warnings',
    '- Suggest and apply fixes for validation issues',
    '- Add, update, or delete elements',
    '- Explain AAS concepts and best practices',
    '',
    '## Guidelines',
    '- Always explain what you are going to do before calling tools',
    '- Use semantic IDs when referencing or creating elements',
    '- Changes require user approval through the approval panel',
    '- Be concise but thorough in explanations',
    '',
  ];

  // Add document context if loaded
  if (session.documentState) {
    const env = session.documentState.environment as Environment;
    const aasCount = env.assetAdministrationShells?.length ?? 0;
    const submodelCount = env.submodels?.length ?? 0;
    const conceptCount = env.conceptDescriptions?.length ?? 0;

    parts.push('## Current Document');
    parts.push(`- **Filename**: ${session.documentState.filename || 'Untitled'}`);
    parts.push(`- **Asset Administration Shells**: ${aasCount}`);
    parts.push(`- **Submodels**: ${submodelCount}`);
    parts.push(`- **Concept Descriptions**: ${conceptCount}`);
    parts.push(`- **Unsaved changes**: ${session.documentState.dirty ? 'Yes' : 'No'}`);
    parts.push('');

    // List submodels with semantic IDs
    if (env.submodels && env.submodels.length > 0) {
      parts.push('### Submodels');
      for (let i = 0; i < env.submodels.length; i++) {
        const sm = env.submodels[i];
        const semanticId = sm.semanticId?.keys?.[0]?.value || 'no-semantic-id';
        const elementCount = sm.submodelElements?.length ?? 0;
        parts.push(`- **${sm.idShort || 'unnamed'}** (path: /submodels/${i})`);
        parts.push(`  - Semantic ID: \`${semanticId}\``);
        parts.push(`  - Elements: ${elementCount}`);
      }
      parts.push('');
    }

    // Add pending operations status
    if (session.pendingOperations.length > 0) {
      parts.push(`### Pending Approvals`);
      parts.push(`There are ${session.pendingOperations.length} operation(s) awaiting user approval.`);
      parts.push('');
    }
  } else {
    parts.push('## Document Status');
    parts.push('No document is currently loaded. Ask the user to load a document first.');
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Convert MCP tool definitions to Anthropic tool format
 */
function convertToolsToAnthropicFormat(
  mcpTools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>
): Tool[] {
  return mcpTools
    .filter((tool) => !EXCLUDED_TOOLS.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Tool['input_schema'],
    }));
}

/**
 * Convert conversation history to Anthropic message format
 */
function convertHistoryToMessages(history: ConversationMessage[]): MessageParam[] {
  const messages: MessageParam[] = [];

  for (const msg of history) {
    if (msg.role === 'user') {
      messages.push({
        role: 'user',
        content: msg.content,
      });
    } else if (msg.role === 'assistant') {
      // If assistant message has tool calls, we need to reconstruct the tool use blocks
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const contentBlocks: ContentBlock[] = [];

        // Add text content if present
        if (msg.content) {
          contentBlocks.push({ type: 'text', text: msg.content });
        }

        // Add tool use blocks
        for (let i = 0; i < msg.toolCalls.length; i++) {
          const toolCall = msg.toolCalls[i];
          contentBlocks.push({
            type: 'tool_use',
            id: `toolu_history_${i}`,
            name: toolCall.name,
            input: toolCall.input,
          });
        }

        messages.push({
          role: 'assistant',
          content: contentBlocks,
        });

        // Add tool results as a user message
        const toolResults: ToolResultBlockParam[] = msg.toolCalls.map((toolCall, i) => ({
          type: 'tool_result' as const,
          tool_use_id: `toolu_history_${i}`,
          content: JSON.stringify(toolCall.result),
        }));

        messages.push({
          role: 'user',
          content: toolResults,
        });
      } else {
        messages.push({
          role: 'assistant',
          content: msg.content,
        });
      }
    }
  }

  return messages;
}

/**
 * AI Chat tool handler
 */
const aiChat: ToolDefinition = {
  name: 'ai_chat',
  description:
    'Send a message to the AI assistant for intelligent help with AAS documents. ' +
    'The AI can query the document, validate content, explain concepts, and suggest changes.',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The user message to send to the AI assistant',
      },
      conversationHistory: {
        type: 'array',
        description: 'Previous messages in the conversation for multi-turn context',
        items: {
          type: 'object',
          properties: {
            role: {
              type: 'string',
              enum: ['user', 'assistant'],
            },
            content: {
              type: 'string',
            },
            toolCalls: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  input: { type: 'object' },
                  result: {},
                },
              },
            },
          },
          required: ['role', 'content'],
        },
      },
      context: {
        type: 'object',
        description: 'Additional context options',
        properties: {
          focusPath: {
            type: 'string',
            description: 'JSON Pointer path to focus on (e.g., /submodels/0)',
          },
        },
      },
    },
    required: ['message'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { message, conversationHistory = [], context: aiContext } = params as {
      message: string;
      conversationHistory?: ConversationMessage[];
      context?: {
        focusPath?: string;
      };
    };
    const { server, session, logger, anthropicApiKey } = context;

    // Check for API key - prefer request header, fall back to server config
    const apiKey = anthropicApiKey || server.config.ai.apiKey;
    if (!apiKey) {
      return {
        success: false,
        error:
          'AI features require an Anthropic API key. ' +
          'Set your API key in Settings or configure ANTHROPIC_API_KEY on the server.',
      };
    }

    logger.info({ messageLength: message.length }, 'Processing AI chat message');

    try {
      // Initialize Anthropic client
      const anthropic = new Anthropic({ apiKey });

      // Build system prompt with document context
      let systemPrompt = buildSystemPrompt(session);

      // Add focus path context if provided
      if (aiContext?.focusPath && session.documentState?.environment) {
        const env = session.documentState.environment as Environment;
        try {
          // Navigate to the focused element
          const pathParts = aiContext.focusPath.split('/').filter(Boolean);
          let current: unknown = env;
          for (const part of pathParts) {
            if (current && typeof current === 'object') {
              current = (current as Record<string, unknown>)[part];
            }
          }
          if (current) {
            systemPrompt += `\n## Focus Context\nUser is currently focused on: \`${aiContext.focusPath}\`\n`;
            systemPrompt += `\`\`\`json\n${JSON.stringify(current, null, 2).slice(0, 2000)}\n\`\`\`\n`;
          }
        } catch {
          // Ignore path navigation errors
        }
      }

      // Get available tools from the transport handler
      const mcpTools = getAvailableTools(context);
      const anthropicTools = convertToolsToAnthropicFormat(mcpTools);

      // Build messages array with history
      const messages = convertHistoryToMessages(conversationHistory);

      // Add current user message
      messages.push({
        role: 'user',
        content: message,
      });

      // Track tool calls for response
      const toolCallsExecuted: Array<{
        name: string;
        input: Record<string, unknown>;
        result: unknown;
        success: boolean;
      }> = [];

      // Tool calling loop
      let response = await anthropic.messages.create({
        model: server.config.ai.model || 'claude-sonnet-4-20250514',
        max_tokens: server.config.ai.maxTokens || 4096,
        system: systemPrompt,
        tools: anthropicTools,
        messages,
      });

      let iterations = 0;

      while (response.stop_reason === 'tool_use' && iterations < MAX_TOOL_CALLS) {
        iterations++;
        logger.debug({ iteration: iterations }, 'Processing tool calls');

        // Extract tool use blocks
        const toolUseBlocks = response.content.filter(
          (block): block is ToolUseBlock => block.type === 'tool_use'
        );

        // Execute each tool
        const toolResults: ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          logger.info({ tool: toolUse.name }, 'Executing tool call');

          try {
            // Call the MCP tool internally
            const toolResult = await callToolInternal(
              toolUse.name,
              toolUse.input as Record<string, unknown>,
              context
            );

            toolCallsExecuted.push({
              name: toolUse.name,
              input: toolUse.input as Record<string, unknown>,
              result: toolResult.data ?? toolResult.error,
              success: toolResult.success,
            });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(toolResult.success ? toolResult.data : { error: toolResult.error }),
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error({ tool: toolUse.name, error }, 'Tool call failed');

            toolCallsExecuted.push({
              name: toolUse.name,
              input: toolUse.input as Record<string, unknown>,
              result: { error: errorMessage },
              success: false,
            });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: errorMessage }),
              is_error: true,
            });
          }
        }

        // Add assistant message with tool calls and tool results to messages
        messages.push({
          role: 'assistant',
          content: response.content,
        });

        messages.push({
          role: 'user',
          content: toolResults,
        });

        // Continue the conversation
        response = await anthropic.messages.create({
          model: server.config.ai.model || 'claude-sonnet-4-20250514',
          max_tokens: server.config.ai.maxTokens || 4096,
          system: systemPrompt,
          tools: anthropicTools,
          messages,
        });
      }

      // Extract final text response
      const textContent = response.content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      logger.info(
        {
          toolCallCount: toolCallsExecuted.length,
          stopReason: response.stop_reason,
        },
        'AI chat completed'
      );

      return {
        success: true,
        data: {
          response: textContent,
          toolCalls: toolCallsExecuted.length > 0 ? toolCallsExecuted : undefined,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          },
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown AI error';
      logger.error({ error }, 'AI chat failed');

      // Provide helpful error messages for common issues
      if (errorMessage.includes('authentication') || errorMessage.includes('401')) {
        return {
          success: false,
          error: 'Invalid Anthropic API key. Please check your ANTHROPIC_API_KEY environment variable.',
        };
      }

      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        return {
          success: false,
          error: 'Rate limit exceeded. Please wait a moment before trying again.',
        };
      }

      return {
        success: false,
        error: `AI processing error: ${errorMessage}`,
      };
    }
  },
};

/**
 * Get available tools for AI to use
 *
 * This function accesses the registered tools from the server context.
 * Tools are filtered to exclude AI-specific tools to prevent recursion.
 */
function getAvailableTools(
  context: ToolContext
): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
  // Access the global tool registry through server context
  const toolRegistry = (context.server as unknown as { toolRegistry?: Map<string, ToolDefinition> })
    .toolRegistry;

  if (!toolRegistry) {
    context.logger.warn('Tool registry not available');
    return [];
  }

  return Array.from(toolRegistry.values())
    .filter((tool) => !EXCLUDED_TOOLS.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
}

/**
 * Call an MCP tool internally
 *
 * This allows the AI to call other tools in the system.
 */
async function callToolInternal(
  toolName: string,
  params: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  // Access the global tool registry
  const toolRegistry = (context.server as unknown as { toolRegistry?: Map<string, ToolDefinition> })
    .toolRegistry;

  if (!toolRegistry) {
    return {
      success: false,
      error: 'Tool registry not available',
    };
  }

  const tool = toolRegistry.get(toolName);
  if (!tool) {
    return {
      success: false,
      error: `Unknown tool: ${toolName}`,
    };
  }

  // Prevent AI from calling itself
  if (EXCLUDED_TOOLS.has(toolName)) {
    return {
      success: false,
      error: `Tool ${toolName} cannot be called by AI`,
    };
  }

  // Call the tool handler with the same context
  const toolContext: ToolContext = {
    server: context.server,
    session: context.session,
    logger: context.logger.child({ aiToolCall: toolName }),
  };

  return tool.handler(params, toolContext);
}

export const aiTools: ToolDefinition[] = [aiChat];
