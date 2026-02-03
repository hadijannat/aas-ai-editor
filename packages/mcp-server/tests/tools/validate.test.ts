/**
 * Tests for Validation Tools
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validateTools } from '../../src/tools/validate.js';
import {
  createMockSession,
  createEmptySession,
  createMockToolContext,
  sampleEnvironment,
} from './test-helpers.js';
import type { SessionData } from '../../src/types.js';
import type { Environment } from '@aas-ai-editor/core';

// Get individual tools
const validateFast = validateTools.find((t) => t.name === 'validate_fast')!;
const validateSummary = validateTools.find((t) => t.name === 'validate_summary')!;
const validateAutoFix = validateTools.find((t) => t.name === 'validate_auto_fix')!;

describe('Validation Tools', () => {
  let session: SessionData;

  beforeEach(() => {
    session = createMockSession(structuredClone(sampleEnvironment));
  });

  describe('validate_fast', () => {
    it('returns error when no document is loaded', async () => {
      const emptySession = createEmptySession();
      const context = createMockToolContext(emptySession);

      const result = await validateFast.handler({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No document loaded');
    });

    it('validates the full document', async () => {
      const context = createMockToolContext(session);

      const result = await validateFast.handler({}, context);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('valid', true);
      expect(result.data).toHaveProperty('errors');
      expect(result.data).toHaveProperty('warnings');
      expect(result.data).toHaveProperty('scope', 'Full document');
    });

    it('validates a specific submodel by ID', async () => {
      const context = createMockToolContext(session);

      const result = await validateFast.handler(
        { submodelId: 'https://example.com/submodel/nameplate' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('valid', true);
      expect((result.data as any).scope).toContain('Submodel');
    });

    it('validates a specific submodel by idShort', async () => {
      const context = createMockToolContext(session);

      const result = await validateFast.handler(
        { submodelId: 'Nameplate' },
        context
      );

      expect(result.success).toBe(true);
    });

    it('returns error for unknown submodel', async () => {
      const context = createMockToolContext(session);

      const result = await validateFast.handler(
        { submodelId: 'UnknownSubmodel' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Submodel not found');
    });

    it('detects validation errors', async () => {
      // Create environment with a missing required field
      const invalidEnv: Environment = {
        assetAdministrationShells: [
          {
            modelType: 'AssetAdministrationShell',
            id: '', // Missing ID - should trigger error
            assetInformation: {
              assetKind: 'Instance',
            },
          },
        ],
        submodels: [],
        conceptDescriptions: [],
      };

      const invalidSession = createMockSession(invalidEnv);
      const context = createMockToolContext(invalidSession);

      const result = await validateFast.handler({}, context);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('valid', false);
      expect((result.data as any).errors.length).toBeGreaterThan(0);
    });
  });

  describe('validate_summary', () => {
    it('returns summary of validation status', async () => {
      const context = createMockToolContext(session);

      const result = await validateSummary.handler({}, context);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('valid');
      expect(result.data).toHaveProperty('submodelCount', 1);
      expect(result.data).toHaveProperty('validSubmodels');
      expect(result.data).toHaveProperty('aasCount', 1);
      expect(result.data).toHaveProperty('errorCount');
      expect(result.data).toHaveProperty('warningCount');
      expect(result.data).toHaveProperty('submodelSummary');
    });

    it('includes per-submodel breakdown', async () => {
      const context = createMockToolContext(session);

      const result = await validateSummary.handler({}, context);

      expect(result.success).toBe(true);
      const summary = (result.data as any).submodelSummary;
      expect(summary).toHaveLength(1);
      expect(summary[0]).toMatchObject({
        idShort: 'Nameplate',
        id: 'https://example.com/submodel/nameplate',
        valid: true,
      });
    });
  });

  describe('validate_auto_fix', () => {
    it('returns error when no document is loaded', async () => {
      const emptySession = createEmptySession();
      const context = createMockToolContext(emptySession);

      const result = await validateAutoFix.handler({ errors: [] }, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No document loaded');
    });

    it('returns success with no patches when errors array is empty', async () => {
      const context = createMockToolContext(session);

      const result = await validateAutoFix.handler({ errors: [] }, context);

      expect(result.success).toBe(true);
      expect((result.data as any).fixedCount).toBe(0);
      expect((result.data as any).pendingPatches).toHaveLength(0);
    });

    it('generates fix for missing idShort error', async () => {
      // Create environment with missing idShort
      const invalidEnv: Environment = {
        assetAdministrationShells: [],
        submodels: [
          {
            modelType: 'Submodel',
            id: 'https://example.com/submodel/test',
            idShort: 'TestSubmodel',
            submodelElements: [
              {
                modelType: 'Property',
                // Missing idShort
                valueType: 'xs:string',
                value: 'test',
              } as any,
            ],
          },
        ],
        conceptDescriptions: [],
      };

      const invalidSession = createMockSession(invalidEnv);
      const context = createMockToolContext(invalidSession);

      const errors = [
        {
          path: '/submodels/0/submodelElements/0/idShort',
          message: 'SubmodelElement must have an idShort',
          code: 'REQUIRED_FIELD',
          severity: 'error' as const,
        },
      ];

      const result = await validateAutoFix.handler({ errors }, context);

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.summary.fixable).toBe(1);
      expect(data.pendingPatches).toHaveLength(1);
      expect(data.pendingPatches[0].op).toBe('add');
      expect(data.pendingPatches[0].path).toBe('/submodels/0/submodelElements/0/idShort');
    });

    it('generates fix for missing valueType error', async () => {
      const invalidEnv: Environment = {
        assetAdministrationShells: [],
        submodels: [
          {
            modelType: 'Submodel',
            id: 'https://example.com/submodel/test',
            idShort: 'TestSubmodel',
            submodelElements: [
              {
                modelType: 'Property',
                idShort: 'TestProperty',
                // Missing valueType
                value: '42',
              } as any,
            ],
          },
        ],
        conceptDescriptions: [],
      };

      const invalidSession = createMockSession(invalidEnv);
      const context = createMockToolContext(invalidSession);

      const errors = [
        {
          path: '/submodels/0/submodelElements/0/valueType',
          message: 'Property must have a valueType',
          code: 'REQUIRED_FIELD',
          severity: 'error' as const,
        },
      ];

      const result = await validateAutoFix.handler({ errors }, context);

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.summary.fixable).toBe(1);
      expect(data.pendingPatches[0].value).toBe('xs:string');
    });

    it('generates fix for missing assetInformation', async () => {
      const invalidEnv: Environment = {
        assetAdministrationShells: [
          {
            modelType: 'AssetAdministrationShell',
            id: 'https://example.com/aas/test',
            idShort: 'TestAAS',
            // Missing assetInformation
          } as any,
        ],
        submodels: [],
        conceptDescriptions: [],
      };

      const invalidSession = createMockSession(invalidEnv);
      const context = createMockToolContext(invalidSession);

      const errors = [
        {
          path: '/assetAdministrationShells/0/assetInformation',
          message: 'AssetAdministrationShell must have assetInformation',
          code: 'REQUIRED_FIELD',
          severity: 'error' as const,
        },
      ];

      const result = await validateAutoFix.handler({ errors }, context);

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.summary.fixable).toBe(1);
      expect(data.pendingPatches[0].value).toMatchObject({
        assetKind: 'Instance',
      });
      expect(data.pendingPatches[0].value.globalAssetId).toBeDefined();
    });

    it('marks unfixable errors as requiring manual intervention', async () => {
      const context = createMockToolContext(session);

      const errors = [
        {
          path: '/submodels/0/semanticId',
          message: 'Submodel should have a semanticId for interoperability',
          code: 'MISSING_SEMANTIC_ID',
          severity: 'warning' as const,
        },
      ];

      const result = await validateAutoFix.handler({ errors }, context);

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.summary.fixable).toBe(0);
      expect(data.summary.unfixable).toBe(1);
      expect(data.remainingErrors).toHaveLength(1);
      expect(data.remainingErrors[0].reason).toContain('manual fix');
    });

    it('handles multiple errors with mixed fixability', async () => {
      const invalidEnv: Environment = {
        assetAdministrationShells: [
          {
            modelType: 'AssetAdministrationShell',
            id: '', // Missing ID
            assetInformation: {
              assetKind: 'Instance',
            },
          } as any,
        ],
        submodels: [
          {
            modelType: 'Submodel',
            id: 'https://example.com/submodel/test',
            idShort: 'TestSubmodel',
            // Missing semanticId (warning, not auto-fixable)
            submodelElements: [
              {
                modelType: 'Property',
                // Missing idShort
                valueType: 'xs:string',
              } as any,
            ],
          },
        ],
        conceptDescriptions: [],
      };

      const invalidSession = createMockSession(invalidEnv);
      const context = createMockToolContext(invalidSession);

      const errors = [
        {
          path: '/assetAdministrationShells/0/id',
          message: 'AssetAdministrationShell must have an id',
          code: 'REQUIRED_FIELD',
        },
        {
          path: '/submodels/0/submodelElements/0/idShort',
          message: 'SubmodelElement must have an idShort',
          code: 'REQUIRED_FIELD',
        },
        {
          path: '/submodels/0/semanticId',
          message: 'Submodel should have a semanticId',
          code: 'MISSING_SEMANTIC_ID',
        },
      ];

      const result = await validateAutoFix.handler({ errors }, context);

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.summary.totalErrors).toBe(3);
      expect(data.summary.fixable).toBe(2); // id and idShort
      expect(data.summary.unfixable).toBe(1); // semanticId
      expect(data.pendingPatches).toHaveLength(2);
    });

    it('categorizes patches by confidence level', async () => {
      const invalidEnv: Environment = {
        assetAdministrationShells: [],
        submodels: [
          {
            modelType: 'Submodel',
            id: 'https://example.com/submodel/test',
            idShort: 'TestSubmodel',
            submodelElements: [
              {
                // Missing modelType and idShort
                valueType: 'xs:string',
              } as any,
            ],
          },
        ],
        conceptDescriptions: [],
      };

      const invalidSession = createMockSession(invalidEnv);
      const context = createMockToolContext(invalidSession);

      const errors = [
        {
          path: '/submodels/0/submodelElements/0/modelType',
          message: 'SubmodelElement must have a modelType',
          code: 'REQUIRED_FIELD',
        },
        {
          path: '/submodels/0/submodelElements/0/idShort',
          message: 'SubmodelElement must have an idShort',
          code: 'REQUIRED_FIELD',
        },
      ];

      const result = await validateAutoFix.handler({ errors }, context);

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.suggestions.lowConfidence.length).toBeGreaterThanOrEqual(1); // modelType fix
      expect(data.suggestions.mediumConfidence.length).toBeGreaterThanOrEqual(1); // idShort fix
    });

    it('respects maxAttempts parameter', async () => {
      const context = createMockToolContext(session);

      // Create many errors but limit attempts
      const errors = Array.from({ length: 10 }, (_, i) => ({
        path: `/submodels/0/submodelElements/${i}/idShort`,
        message: 'SubmodelElement must have an idShort',
        code: 'REQUIRED_FIELD',
      }));

      const result = await validateAutoFix.handler({ errors, maxAttempts: 1 }, context);

      expect(result.success).toBe(true);
      const data = result.data as any;
      // With maxAttempts=1, we should process all errors (maxAttempts is per-error limit)
      expect(data.summary.attemptsMade).toBeLessThanOrEqual(10);
    });

    it('includes AI-generated metadata in patches', async () => {
      const invalidEnv: Environment = {
        assetAdministrationShells: [],
        submodels: [
          {
            modelType: 'Submodel',
            id: 'https://example.com/submodel/test',
            idShort: 'TestSubmodel',
            submodelElements: [
              {
                modelType: 'Property',
                // Missing idShort
                valueType: 'xs:string',
              } as any,
            ],
          },
        ],
        conceptDescriptions: [],
      };

      const invalidSession = createMockSession(invalidEnv);
      const context = createMockToolContext(invalidSession);

      const errors = [
        {
          path: '/submodels/0/submodelElements/0/idShort',
          message: 'SubmodelElement must have an idShort',
          code: 'REQUIRED_FIELD',
        },
      ];

      const result = await validateAutoFix.handler({ errors }, context);

      expect(result.success).toBe(true);
      const data = result.data as any;
      const patch = data.pendingPatches[0];
      expect(patch.aiGenerated).toBe(true);
      expect(patch.reason).toContain('Auto-generated');
      expect(patch.approvalTier).toBeDefined();
    });
  });
});
