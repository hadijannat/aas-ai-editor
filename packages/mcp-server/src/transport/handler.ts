/**
 * MCP Streamable HTTP Transport Handler
 *
 * Implements the MCP Streamable HTTP transport protocol
 * with session management and request routing.
 */

import type { Request, Response } from 'express';
import type { ServerContext, ToolDefinition, ResourceDefinition, PromptDefinition } from '../types.js';

/**
 * Transport handler for MCP Streamable HTTP
 */
export interface TransportHandler {
  /** Handle incoming MCP request */
  handleRequest: (req: Request, res: Response) => Promise<void>;

  /** Handle SSE stream connection */
  handleStream: (req: Request, res: Response) => void;

  /** Register a tool */
  registerTool: (tool: ToolDefinition) => void;

  /** Register a resource */
  registerResource: (resource: ResourceDefinition) => void;

  /** Register a prompt */
  registerPrompt: (prompt: PromptDefinition) => void;
}

/**
 * Create a transport handler
 */
export function createTransportHandler(context: ServerContext): TransportHandler {
  const tools = new Map<string, ToolDefinition>();
  const resources = new Map<string, ResourceDefinition>();
  const prompts = new Map<string, PromptDefinition>();

  // Active SSE connections by session ID
  const streams = new Map<string, Response>();

  /**
   * Handle incoming MCP request
   */
  async function handleRequest(req: Request, res: Response): Promise<void> {
    const { logger, sessionManager } = context;

    try {
      // Get or create session
      const headerSessionId = req.headers['x-session-id'] as string | undefined;
      let session = headerSessionId ? sessionManager.get(headerSessionId) : undefined;

      if (!session) {
        session = sessionManager.create();
      }

      const sessionId = session.id;

      // Update activity
      sessionManager.touch(sessionId);

      // Parse MCP message
      const message = req.body;
      const { method, params, id } = message;

      logger.debug({ method, sessionId }, 'MCP request received');

      // Route to handler
      let result: unknown;

      switch (method) {
        case 'initialize':
          result = handleInitialize(params);
          break;

        case 'tools/list':
          result = handleListTools();
          break;

        case 'tools/call':
          result = await handleCallTool(params, session, context);
          break;

        case 'resources/list':
          result = handleListResources();
          break;

        case 'resources/read':
          result = await handleReadResource(params, session, context);
          break;

        case 'prompts/list':
          result = handleListPrompts();
          break;

        case 'prompts/get':
          result = await handleGetPrompt(params, session, context);
          break;

        default:
          throw new Error(`Unknown method: ${method}`);
      }

      // Send response
      res.setHeader('X-Session-Id', sessionId);
      res.json({
        jsonrpc: '2.0',
        id,
        result,
      });
    } catch (error) {
      logger.error({ error }, 'MCP request error');
      res.status(400).json({
        jsonrpc: '2.0',
        id: req.body?.id,
        error: {
          code: -32600,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  /**
   * Handle initialize request
   */
  function handleInitialize(_params: unknown) {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
      },
      serverInfo: {
        name: 'aas-ai-editor',
        version: '0.1.0',
      },
    };
  }

  /**
   * Handle tools/list request
   */
  function handleListTools() {
    return {
      tools: Array.from(tools.values()).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  }

  /**
   * Handle tools/call request
   */
  async function handleCallTool(
    params: { name: string; arguments?: Record<string, unknown> },
    session: ReturnType<typeof context.sessionManager.get>,
    ctx: ServerContext
  ) {
    const tool = tools.get(params.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${params.name}`);
    }

    if (!session) {
      throw new Error('Session required for tool calls');
    }

    const toolContext = {
      server: ctx,
      session,
      logger: ctx.logger.child({ tool: params.name }),
    };

    const result = await tool.handler(params.arguments || {}, toolContext);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result.data ?? result, null, 2),
        },
      ],
      isError: !result.success,
    };
  }

  /**
   * Handle resources/list request
   */
  function handleListResources() {
    return {
      resources: Array.from(resources.values()).map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      })),
    };
  }

  /**
   * Handle resources/read request
   */
  async function handleReadResource(
    params: { uri: string },
    session: ReturnType<typeof context.sessionManager.get>,
    ctx: ServerContext
  ) {
    // Find matching resource by URI pattern
    const resource = Array.from(resources.values()).find((r) =>
      params.uri.startsWith(r.uri.replace('*', ''))
    );

    if (!resource) {
      throw new Error(`Unknown resource: ${params.uri}`);
    }

    if (!session) {
      throw new Error('Session required for resource access');
    }

    const toolContext = {
      server: ctx,
      session,
      logger: ctx.logger.child({ resource: resource.name }),
    };

    const content = await resource.handler(params.uri, toolContext);

    return {
      contents: [content],
    };
  }

  /**
   * Handle prompts/list request
   */
  function handleListPrompts() {
    return {
      prompts: Array.from(prompts.values()).map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      })),
    };
  }

  /**
   * Handle prompts/get request
   */
  async function handleGetPrompt(
    params: { name: string; arguments?: Record<string, unknown> },
    session: ReturnType<typeof context.sessionManager.get>,
    ctx: ServerContext
  ) {
    const prompt = prompts.get(params.name);
    if (!prompt) {
      throw new Error(`Unknown prompt: ${params.name}`);
    }

    if (!session) {
      throw new Error('Session required for prompts');
    }

    const toolContext = {
      server: ctx,
      session,
      logger: ctx.logger.child({ prompt: params.name }),
    };

    const messages = await prompt.handler(params.arguments || {}, toolContext);

    return { messages };
  }

  /**
   * Handle SSE stream connection
   */
  function handleStream(req: Request, res: Response): void {
    const sessionId = req.params.sessionId;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Store connection
    streams.set(sessionId, res);

    // Send initial event
    res.write(`event: connected\ndata: ${JSON.stringify({ sessionId })}\n\n`);

    // Handle disconnect
    req.on('close', () => {
      streams.delete(sessionId);
      context.logger.debug({ sessionId }, 'SSE stream closed');
    });
  }

  return {
    handleRequest,
    handleStream,
    registerTool: (tool) => tools.set(tool.name, tool),
    registerResource: (resource) => resources.set(resource.uri, resource),
    registerPrompt: (prompt) => prompts.set(prompt.name, prompt),
  };
}
