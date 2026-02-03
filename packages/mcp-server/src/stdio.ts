#!/usr/bin/env node
/**
 * MCP Server - Stdio Transport
 *
 * This provides a stdio-based MCP server for use with Claude Code CLI
 * and other MCP clients that use stdio transport.
 *
 * Usage:
 *   node dist/stdio.js
 *
 * Or via Claude Code:
 *   claude mcp add aas-editor node /path/to/dist/stdio.js
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import pino from 'pino';
import { SessionManager } from './transport/session.js';
import { loadConfig } from './config/index.js';
import { allTools } from './tools/index.js';
import { allResources } from './resources/index.js';
import { allPrompts } from './prompts/index.js';
import type { ServerContext, ToolContext, SessionData, PromptDefinition } from './types.js';

// Logger that writes to stderr (stdout is reserved for MCP protocol)
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, destination: 2 }, // stderr
  },
  level: 'warn', // Only log warnings and errors to avoid cluttering stdio
});

/**
 * Create and start the stdio MCP server
 */
async function main() {
  const config = loadConfig();
  const sessionManager = new SessionManager(config.session);

  // Create a default session for stdio mode
  const defaultSession = sessionManager.create({ ip: 'stdio', userAgent: 'claude-code' });

  const context: ServerContext = {
    config,
    logger,
    sessionManager,
  };

  // Create the MCP server
  const server = new Server(
    {
      name: 'aas-ai-editor',
      version: '0.3.1',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // Build tool registry for internal access
  const toolRegistry = new Map(allTools.map((t) => [t.name, t]));
  context.toolRegistry = toolRegistry;

  // Register tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = toolRegistry.get(name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
        isError: true,
      };
    }

    const toolContext: ToolContext = {
      server: context,
      session: defaultSession as SessionData,
      logger: logger.child({ tool: name }),
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    };

    try {
      const result = await tool.handler(args || {}, toolContext);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data ?? result, null, 2) }],
        isError: !result.success,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: errorMessage }) }],
        isError: true,
      };
    }
  });

  // Register resources handler
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: allResources.map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    const resource = allResources.find((r) => uri.startsWith(r.uri.replace('*', '')));
    if (!resource) {
      throw new Error(`Unknown resource: ${uri}`);
    }

    const toolContext: ToolContext = {
      server: context,
      session: defaultSession as SessionData,
      logger: logger.child({ resource: resource.name }),
    };

    try {
      const result = await resource.handler(uri, toolContext);
      // MCP SDK expects 'text' field, not 'content'
      return {
        contents: [{
          uri: result.uri,
          mimeType: result.mimeType,
          text: typeof result.content === 'string' ? result.content : Buffer.from(result.content).toString('base64'),
        }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ error: errorMessage }),
        }],
      };
    }
  });

  // Register prompts handler
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: allPrompts.map((p: PromptDefinition) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      })),
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const prompt = allPrompts.find((p: PromptDefinition) => p.name === name);
    if (!prompt) {
      throw new Error(`Unknown prompt: ${name}`);
    }

    const toolContext: ToolContext = {
      server: context,
      session: defaultSession as SessionData,
      logger: logger.child({ prompt: name }),
    };

    const messages = await prompt.handler(args || {}, toolContext);
    return { messages };
  });

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.warn('AAS AI Editor MCP Server started (stdio mode)');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
