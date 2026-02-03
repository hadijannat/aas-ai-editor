/**
 * Test helpers for MCP tool handler tests
 */

import type { Logger } from 'pino';
import type { Environment } from '@aas-ai-editor/core';
import type { SessionData, ToolContext, ServerContext } from '../../src/types.js';

/**
 * Create a mock logger that does nothing
 */
export function createMockLogger(): Logger {
  const noop = () => {};
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    child: () => createMockLogger(),
  } as unknown as Logger;
}

/**
 * Create a mock session with a loaded document
 */
export function createMockSession(environment: Environment): SessionData {
  return {
    id: 'test-session-123',
    createdAt: new Date(),
    lastActivityAt: new Date(),
    documentId: '/test/sample.aasx',
    documentState: {
      id: '/test/sample.aasx',
      filename: 'sample.aasx',
      environment,
      dirty: false,
      undoStack: [],
      redoStack: [],
    },
    pendingOperations: [],
  };
}

/**
 * Create a mock session without a document
 */
export function createEmptySession(): SessionData {
  return {
    id: 'test-session-123',
    createdAt: new Date(),
    lastActivityAt: new Date(),
    pendingOperations: [],
  };
}

/**
 * Create a mock server context
 */
export function createMockServerContext(): ServerContext {
  return {
    config: {
      port: 3000,
      host: 'localhost',
      services: {
        validationUrl: 'http://localhost:8000',
      },
    },
    logger: createMockLogger(),
    sessionManager: {} as any,
  } as ServerContext;
}

/**
 * Create a mock tool context
 */
export function createMockToolContext(session: SessionData): ToolContext {
  return {
    server: createMockServerContext(),
    session,
    logger: createMockLogger(),
  };
}

/**
 * Sample AAS Environment for testing
 */
export const sampleEnvironment: Environment = {
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
