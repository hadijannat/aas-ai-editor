/**
 * MCP Service
 *
 * Client for communicating with the MCP server.
 */

import { ref } from 'vue';

export interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

const sessionId = ref<string | null>(null);
const isConnected = ref(false);

const MCP_BASE_URL = import.meta.env.VITE_MCP_SERVER_URL || '/mcp';

/**
 * Call an MCP tool
 */
async function callTool(
  name: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (sessionId.value) {
    headers['X-Session-Id'] = sessionId.value;
  }

  const response = await fetch(MCP_BASE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name,
        arguments: params,
      },
    }),
  });

  // Capture session ID from response
  const newSessionId = response.headers.get('X-Session-Id');
  if (newSessionId) {
    sessionId.value = newSessionId;
  }

  const data = await response.json();

  if (data.error) {
    return {
      success: false,
      error: data.error.message,
    };
  }

  // Parse result from MCP response
  const content = data.result?.content?.[0];
  if (content?.type === 'text') {
    try {
      const parsed = JSON.parse(content.text);
      return {
        success: !data.result?.isError,
        data: parsed,
      };
    } catch {
      return {
        success: !data.result?.isError,
        data: { text: content.text },
      };
    }
  }

  return { success: true, data: data.result };
}

/**
 * Read an MCP resource
 */
async function readResource(uri: string): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (sessionId.value) {
    headers['X-Session-Id'] = sessionId.value;
  }

  const response = await fetch(MCP_BASE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'resources/read',
      params: { uri },
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  const content = data.result?.contents?.[0];
  if (content?.mimeType === 'application/json') {
    return JSON.parse(content.content);
  }

  return content?.content;
}

/**
 * Initialize MCP connection
 */
async function initialize(): Promise<boolean> {
  try {
    const response = await fetch(MCP_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'aas-ai-editor-web',
            version: '0.1.0',
          },
        },
      }),
    });

    const newSessionId = response.headers.get('X-Session-Id');
    if (newSessionId) {
      sessionId.value = newSessionId;
    }

    const data = await response.json();
    isConnected.value = !data.error;

    return isConnected.value;
  } catch {
    isConnected.value = false;
    return false;
  }
}

/**
 * Use MCP service composable
 */
export function useMcpService() {
  return {
    sessionId,
    isConnected,
    callTool,
    readResource,
    initialize,
  };
}
