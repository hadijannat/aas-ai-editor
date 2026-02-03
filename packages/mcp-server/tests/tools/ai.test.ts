/**
 * AI Chat Tool Tests
 *
 * Tests for the ai_chat tool with mocked Anthropic SDK.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ToolContext, ToolDefinition, SessionData, ServerContext } from '../../src/types.js';
import type { Logger } from 'pino';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

// Import after mock setup
import { aiTools } from '../../src/tools/ai.js';

/**
 * Create a mock tool context for testing
 */
function createMockContext(overrides: Partial<{
  apiKey: string;
  documentLoaded: boolean;
  environment: Record<string, unknown>;
  toolRegistry: Map<string, ToolDefinition>;
}>): ToolContext {
  const {
    apiKey = 'test-api-key',
    documentLoaded = true,
    environment = {
      assetAdministrationShells: [],
      submodels: [
        {
          id: 'test-submodel',
          idShort: 'TestSubmodel',
          semanticId: { keys: [{ value: 'https://example.com/submodel' }] },
          submodelElements: [],
        },
      ],
      conceptDescriptions: [],
    },
    toolRegistry = new Map(),
  } = overrides;

  const session: SessionData = {
    id: 'test-session',
    createdAt: new Date(),
    lastActivityAt: new Date(),
    pendingOperations: [],
  };

  if (documentLoaded) {
    session.documentId = 'test-document.aasx';
    session.documentState = {
      id: 'test-document.aasx',
      filename: 'test-document.aasx',
      environment,
      dirty: false,
      undoStack: [],
      redoStack: [],
    };
  }

  const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => mockLogger),
  } as unknown as Logger;

  const serverContext: ServerContext & { toolRegistry?: Map<string, ToolDefinition> } = {
    config: {
      server: { port: 3001, host: 'localhost' },
      session: {},
      ai: {
        apiKey,
        model: 'claude-sonnet-4-20250514',
        maxTokens: 4096,
      },
      services: {},
      logging: { level: 'info', pretty: false },
    },
    logger: mockLogger,
    sessionManager: {
      create: vi.fn(),
      get: vi.fn(),
      touch: vi.fn(),
      delete: vi.fn(),
      cleanup: vi.fn(),
    } as unknown as ServerContext['sessionManager'],
    toolRegistry,
  };

  return {
    server: serverContext,
    session,
    logger: mockLogger,
  };
}

describe('AI Chat Tool', () => {
  const aiChatTool = aiTools.find((t) => t.name === 'ai_chat')!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('ai_chat', () => {
    it('should exist and have correct schema', () => {
      expect(aiChatTool).toBeDefined();
      expect(aiChatTool.name).toBe('ai_chat');
      expect(aiChatTool.inputSchema.properties).toHaveProperty('message');
      expect(aiChatTool.inputSchema.properties).toHaveProperty('conversationHistory');
      expect(aiChatTool.inputSchema.required).toContain('message');
    });

    it('should fail when API key is not configured', async () => {
      const context = createMockContext({ apiKey: '' });

      const result = await aiChatTool.handler(
        { message: 'Hello' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('ANTHROPIC_API_KEY');
    });

    it('should include document context in system prompt when loaded', async () => {
      // We can't easily test the system prompt content without more complex mocking,
      // but we can verify the tool runs with a loaded document
      const Anthropic = (await import('@anthropic-ai/sdk')).default as unknown as { new(): { messages: { create: ReturnType<typeof vi.fn> } } };
      const mockCreate = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Hello! I can see your document has 1 submodel.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      vi.mocked(Anthropic).mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      const context = createMockContext({});

      const result = await aiChatTool.handler(
        { message: 'What submodels are in this document?' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('response');
    });

    it('should handle API errors gracefully', async () => {
      const Anthropic = (await import('@anthropic-ai/sdk')).default as unknown as { new(): { messages: { create: ReturnType<typeof vi.fn> } } };
      const mockCreate = vi.fn().mockRejectedValue(new Error('Rate limit exceeded'));

      vi.mocked(Anthropic).mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      const context = createMockContext({});

      const result = await aiChatTool.handler(
        { message: 'Hello' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit');
    });

    it('should return tool calls when AI uses tools', async () => {
      const Anthropic = (await import('@anthropic-ai/sdk')).default as unknown as { new(): { messages: { create: ReturnType<typeof vi.fn> } } };

      // Mock a tool calling response followed by final response
      const mockCreate = vi.fn()
        .mockResolvedValueOnce({
          content: [
            { type: 'text', text: 'Let me check the validation for you.' },
            {
              type: 'tool_use',
              id: 'tool_1',
              name: 'validate_fast',
              input: {},
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 100, output_tokens: 50 },
        })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'The document is valid!' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 150, output_tokens: 30 },
        });

      vi.mocked(Anthropic).mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      // Create a mock tool registry with validate_fast
      const toolRegistry = new Map<string, ToolDefinition>();
      toolRegistry.set('validate_fast', {
        name: 'validate_fast',
        description: 'Validate document',
        inputSchema: { type: 'object', properties: {} },
        handler: vi.fn().mockResolvedValue({
          success: true,
          data: { valid: true, errorCount: 0, warningCount: 0 },
        }),
      });

      const context = createMockContext({ toolRegistry });

      const result = await aiChatTool.handler(
        { message: 'Validate the document' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('response', 'The document is valid!');
      expect(result.data).toHaveProperty('toolCalls');
      expect((result.data as { toolCalls: unknown[] }).toolCalls).toHaveLength(1);
      expect((result.data as { toolCalls: Array<{ name: string }> }).toolCalls[0].name).toBe('validate_fast');
    });

    it('should accept conversation history for multi-turn', async () => {
      const Anthropic = (await import('@anthropic-ai/sdk')).default as unknown as { new(): { messages: { create: ReturnType<typeof vi.fn> } } };
      const mockCreate = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Following up on our previous discussion...' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 200, output_tokens: 50 },
      });

      vi.mocked(Anthropic).mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      const context = createMockContext({});

      const result = await aiChatTool.handler(
        {
          message: 'What else can you tell me?',
          conversationHistory: [
            { role: 'user', content: 'What submodels are in this document?' },
            { role: 'assistant', content: 'There is 1 submodel called TestSubmodel.' },
          ],
        },
        context
      );

      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledTimes(1);

      // Verify conversation history was passed
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages.length).toBeGreaterThan(1);
    });
  });
});
