/**
 * MCP Route Handler
 *
 * Intercepts /mcp requests and returns mock responses.
 */

import type { Page, Route } from '@playwright/test';
import type { Environment, PendingOperation } from './types';
import * as responses from './mcp-responses';

export interface MockState {
  environment: Environment;
  pendingOperations: PendingOperation[];
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
}

interface JsonRpcRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * Default test environment
 */
export const defaultEnvironment: Environment = {
  assetAdministrationShells: [
    {
      modelType: 'AssetAdministrationShell',
      id: 'https://example.com/aas/sample-product',
      idShort: 'SampleProduct',
      assetInformation: {
        assetKind: 'Instance',
        globalAssetId: 'https://example.com/asset/sample-product-001',
      },
      submodels: [
        {
          type: 'ModelReference',
          keys: [
            {
              type: 'Submodel',
              value: 'https://example.com/submodel/nameplate',
            },
          ],
        },
      ],
    },
  ],
  submodels: [
    {
      modelType: 'Submodel',
      id: 'https://example.com/submodel/nameplate',
      idShort: 'Nameplate',
      semanticId: {
        type: 'ExternalReference',
        keys: [
          {
            type: 'GlobalReference',
            value: 'https://admin-shell.io/zvei/nameplate/2/0/Nameplate',
          },
        ],
      },
      submodelElements: [
        {
          modelType: 'Property',
          idShort: 'ManufacturerName',
          semanticId: {
            type: 'ExternalReference',
            keys: [
              {
                type: 'GlobalReference',
                value: '0173-1#02-AAO677#002',
              },
            ],
          },
          valueType: 'xs:string',
          value: 'ACME Corporation',
        },
        {
          modelType: 'Property',
          idShort: 'ManufacturerProductDesignation',
          valueType: 'xs:string',
          value: 'Industrial Widget Pro',
        },
        {
          modelType: 'SubmodelElementCollection',
          idShort: 'ContactInformation',
          value: [
            {
              modelType: 'Property',
              idShort: 'Street',
              valueType: 'xs:string',
              value: '123 Industrial Ave',
            },
            {
              modelType: 'Property',
              idShort: 'City',
              valueType: 'xs:string',
              value: 'Manufacturing City',
            },
          ],
        },
      ],
    },
  ],
  conceptDescriptions: [],
};

/**
 * Create default mock state
 */
export function createMockState(
  overrides: Partial<MockState> = {}
): MockState {
  return {
    environment: defaultEnvironment,
    pendingOperations: [],
    canUndo: false,
    canRedo: false,
    dirty: false,
    ...overrides,
  };
}

/**
 * Setup MCP route handler on a page
 */
export async function setupMcpMocks(
  page: Page,
  initialState: MockState = createMockState()
): Promise<{
  state: MockState;
  updateState: (updates: Partial<MockState>) => void;
}> {
  const state = { ...initialState };

  const updateState = (updates: Partial<MockState>) => {
    Object.assign(state, updates);
  };

  await page.route('**/mcp', async (route: Route) => {
    const request = route.request();
    const body = request.postDataJSON() as JsonRpcRequest;

    const response = handleMcpRequest(body, state);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'X-Session-Id': 'mock-session-123',
      },
      body: JSON.stringify(response),
    });
  });

  return { state, updateState };
}

/**
 * Handle an MCP JSON-RPC request
 */
function handleMcpRequest(
  request: JsonRpcRequest,
  state: MockState
): Record<string, unknown> {
  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      return responses.initializeResponse(id);

    case 'tools/call':
      return handleToolCall(id, params as { name: string; arguments: Record<string, unknown> }, state);

    case 'resources/read':
      return handleResourceRead(id, params as { uri: string }, state);

    default:
      return responses.jsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

/**
 * Handle a tool call
 */
function handleToolCall(
  id: number,
  params: { name: string; arguments: Record<string, unknown> },
  state: MockState
): Record<string, unknown> {
  const { name } = params;

  switch (name) {
    case 'document_load_content':
      return responses.documentLoadResponse(id, {
        documentId: 'test-doc-123',
        filename: (params.arguments?.filename as string) || 'test.aasx',
        shellCount: state.environment.assetAdministrationShells?.length ?? 0,
        submodelCount: state.environment.submodels?.length ?? 0,
        conceptCount: state.environment.conceptDescriptions?.length ?? 0,
      });

    case 'document_status':
      return responses.documentStatusResponse(id, {
        canUndo: state.canUndo,
        canRedo: state.canRedo,
        dirty: state.dirty,
      });

    case 'document_save':
      state.dirty = false;
      return responses.documentSaveResponse(id);

    case 'document_undo':
      if (state.canUndo) {
        state.canUndo = false;
        state.canRedo = true;
        return responses.documentUndoResponse(id, true);
      }
      return responses.documentUndoResponse(id, false);

    case 'document_redo':
      if (state.canRedo) {
        state.canRedo = false;
        state.canUndo = true;
        return responses.documentRedoResponse(id, true);
      }
      return responses.documentRedoResponse(id, false);

    case 'edit_list_pending':
      return responses.editListPendingResponse(id, state.pendingOperations);

    case 'edit_approve': {
      const opIds = params.arguments?.operationIds as string[] | undefined;
      const count = opIds?.length ?? state.pendingOperations.length;
      if (opIds) {
        state.pendingOperations = state.pendingOperations.filter(
          (op) => !opIds.includes(op.id)
        );
      } else {
        state.pendingOperations = [];
      }
      state.dirty = true;
      state.canUndo = true;
      return responses.editApproveResponse(id, count);
    }

    case 'edit_reject': {
      const rejectIds = params.arguments?.operationIds as string[] | undefined;
      const rejectCount = rejectIds?.length ?? state.pendingOperations.length;
      if (rejectIds) {
        state.pendingOperations = state.pendingOperations.filter(
          (op) => !rejectIds.includes(op.id)
        );
      } else {
        state.pendingOperations = [];
      }
      return responses.editRejectResponse(id, rejectCount);
    }

    case 'edit_set_property': {
      const path = params.arguments?.path as string;
      const newOp: PendingOperation = {
        id: `op-${Date.now()}`,
        toolName: 'edit_set_property',
        tier: 2,
        reason: (params.arguments?.reason as string) || 'Property change',
        patches: [
          {
            op: 'replace',
            path,
            value: params.arguments?.value,
          },
        ],
      };
      state.pendingOperations.push(newOp);
      return responses.editSetPropertyResponse(id, {
        operationId: newOp.id,
        tier: newOp.tier,
        path,
      });
    }

    case 'validate_fast':
      return responses.validateFastResponse(id, []);

    case 'query_environment':
      return responses.queryEnvironmentResponse(id, state.environment);

    default:
      return responses.jsonRpcError(id, -32601, `Unknown tool: ${name}`);
  }
}

/**
 * Handle a resource read
 */
function handleResourceRead(
  id: number,
  params: { uri: string },
  state: MockState
): Record<string, unknown> {
  const { uri } = params;

  if (uri === 'aas://environment') {
    return responses.resourceReadResponse(id, state.environment);
  }

  return responses.jsonRpcError(id, -32602, `Unknown resource: ${uri}`);
}
