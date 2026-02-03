/**
 * Tests for Query Tools
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { queryTools } from '../../src/tools/query.js';
import {
  createMockSession,
  createEmptySession,
  createMockToolContext,
  sampleEnvironment,
} from './test-helpers.js';
import type { SessionData } from '../../src/types.js';

// Get individual tools
const listSubmodels = queryTools.find((t) => t.name === 'query_list_submodels')!;
const findBySemanticId = queryTools.find((t) => t.name === 'query_find_by_semantic_id')!;
const getByPath = queryTools.find((t) => t.name === 'query_get_by_path')!;
const listElements = queryTools.find((t) => t.name === 'query_list_elements')!;
const getPointer = queryTools.find((t) => t.name === 'query_get_pointer')!;
const queryDiff = queryTools.find((t) => t.name === 'query_diff')!;

describe('Query Tools', () => {
  let session: SessionData;

  beforeEach(() => {
    session = createMockSession(structuredClone(sampleEnvironment));
  });

  describe('query_list_submodels', () => {
    it('returns error when no document is loaded', async () => {
      const emptySession = createEmptySession();
      const context = createMockToolContext(emptySession);

      const result = await listSubmodels.handler({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No document loaded');
    });

    it('lists all submodels with their details', async () => {
      const context = createMockToolContext(session);

      const result = await listSubmodels.handler({}, context);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('count', 1);
      expect(result.data).toHaveProperty('submodels');

      const submodels = (result.data as any).submodels;
      expect(submodels).toHaveLength(1);
      expect(submodels[0]).toMatchObject({
        id: 'https://example.com/submodel/nameplate',
        idShort: 'Nameplate',
        semanticId: 'https://admin-shell.io/zvei/nameplate/2/0/Nameplate',
        elementCount: 3,
      });
    });
  });

  describe('query_find_by_semantic_id', () => {
    it('finds submodel by semantic ID', async () => {
      const context = createMockToolContext(session);

      const result = await findBySemanticId.handler(
        { semanticId: 'https://admin-shell.io/zvei/nameplate/2/0/Nameplate' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('found', true);
      expect(result.data).toHaveProperty('type', 'Submodel');
      expect(result.data).toHaveProperty('jsonPointer', '/submodels/0');
    });

    it('finds element by semantic ID', async () => {
      const context = createMockToolContext(session);

      const result = await findBySemanticId.handler(
        { semanticId: '0173-1#02-AAO677#002' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('found', true);
      expect(result.data).toHaveProperty('type', 'SubmodelElement');
      expect((result.data as any).result.idShort).toBe('ManufacturerName');
    });

    it('returns not found for unknown semantic ID', async () => {
      const context = createMockToolContext(session);

      const result = await findBySemanticId.handler(
        { semanticId: 'https://example.com/unknown' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('found', false);
    });
  });

  describe('query_get_by_path', () => {
    it('gets element by idShort path', async () => {
      const context = createMockToolContext(session);

      const result = await getByPath.handler(
        { submodelId: 'Nameplate', path: 'ManufacturerName' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('found', true);
      expect((result.data as any).element.idShort).toBe('ManufacturerName');
      expect((result.data as any).element.value).toBe('ACME Corporation');
    });

    it('gets nested element by path', async () => {
      const context = createMockToolContext(session);

      const result = await getByPath.handler(
        { submodelId: 'Nameplate', path: 'ContactInformation.Street' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('found', true);
      expect((result.data as any).element.idShort).toBe('Street');
      expect((result.data as any).element.value).toBe('123 Industrial Ave');
    });

    it('returns error for unknown submodel', async () => {
      const context = createMockToolContext(session);

      const result = await getByPath.handler(
        { submodelId: 'UnknownSubmodel', path: 'SomeElement' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Submodel not found');
    });
  });

  describe('query_list_elements', () => {
    it('lists elements at submodel root', async () => {
      const context = createMockToolContext(session);

      const result = await listElements.handler(
        { submodelId: 'Nameplate' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('count', 3);

      const elements = (result.data as any).elements;
      expect(elements).toHaveLength(3);
      expect(elements.map((e: any) => e.idShort)).toContain('ManufacturerName');
      expect(elements.map((e: any) => e.idShort)).toContain('ContactInformation');
    });

    it('lists elements within a collection', async () => {
      const context = createMockToolContext(session);

      const result = await listElements.handler(
        { submodelId: 'Nameplate', collectionPath: 'ContactInformation' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('count', 2);

      const elements = (result.data as any).elements;
      expect(elements.map((e: any) => e.idShort)).toEqual(['Street', 'City']);
    });
  });

  describe('query_get_pointer', () => {
    it('returns JSON Pointer for element', async () => {
      const context = createMockToolContext(session);

      const result = await getPointer.handler(
        { submodelId: 'https://example.com/submodel/nameplate', elementPath: 'ManufacturerName' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('found', true);
      expect(result.data).toHaveProperty('jsonPointer', '/submodels/0/submodelElements/0');
      expect(result.data).toHaveProperty('valuePath', '/submodels/0/submodelElements/0/value');
    });

    it('returns JSON Pointer for nested element', async () => {
      const context = createMockToolContext(session);

      const result = await getPointer.handler(
        { submodelId: 'Nameplate', elementPath: 'ContactInformation.City' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('found', true);
      // Path should traverse through collection
      expect((result.data as any).jsonPointer).toMatch(/\/submodels\/0\/submodelElements\/\d+\/value\/\d+$/);
    });
  });

  describe('query_diff', () => {
    it('returns error when no document is loaded', async () => {
      const emptySession = createEmptySession();
      const context = createMockToolContext(emptySession);

      const result = await queryDiff.handler({ compareWith: 'undo' }, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No document loaded');
    });

    it('returns error when undo stack is empty', async () => {
      const context = createMockToolContext(session);

      const result = await queryDiff.handler({ compareWith: 'undo' }, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No undo state available');
    });

    it('returns error when undoSteps exceeds stack size', async () => {
      // Add one undo entry
      session.documentState!.undoStack = [
        {
          description: 'Changed value',
          inversePatches: [
            { op: 'replace', path: '/submodels/0/submodelElements/0/value', value: 'Old Value' },
          ],
          originalPatches: [
            { op: 'replace', path: '/submodels/0/submodelElements/0/value', value: 'ACME Corporation' },
          ],
        },
      ];

      const context = createMockToolContext(session);

      const result = await queryDiff.handler({ compareWith: 'undo', undoSteps: 5 }, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No undo state available at step 5');
    });

    it('compares with undo state and returns diff', async () => {
      // Simulate a change: original value was 'Old Manufacturer', now 'ACME Corporation'
      session.documentState!.undoStack = [
        {
          description: 'Changed manufacturer name',
          inversePatches: [
            { op: 'replace', path: '/submodels/0/submodelElements/0/value', value: 'Old Manufacturer' },
          ],
          originalPatches: [
            { op: 'replace', path: '/submodels/0/submodelElements/0/value', value: 'ACME Corporation' },
          ],
        },
      ];

      const context = createMockToolContext(session);

      const result = await queryDiff.handler({ compareWith: 'undo' }, context);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('diff');
      expect(result.data).toHaveProperty('summary');

      const summary = (result.data as any).summary;
      expect(summary.changeCount).toBeGreaterThan(0);
      expect(summary.modifications).toBeGreaterThan(0);
      expect(summary.identical).toBe(false);
    });

    it('returns identical=true when documents are the same', async () => {
      // Undo entry that would restore to the same state (no actual change)
      session.documentState!.undoStack = [
        {
          description: 'No-op change',
          inversePatches: [
            { op: 'replace', path: '/submodels/0/submodelElements/0/value', value: 'ACME Corporation' },
          ],
          originalPatches: [
            { op: 'replace', path: '/submodels/0/submodelElements/0/value', value: 'ACME Corporation' },
          ],
        },
      ];

      const context = createMockToolContext(session);

      const result = await queryDiff.handler({ compareWith: 'undo' }, context);

      expect(result.success).toBe(true);
      const summary = (result.data as any).summary;
      expect(summary.identical).toBe(true);
      expect(summary.changeCount).toBe(0);
    });

    it('returns error when fileContent is missing for file comparison', async () => {
      const context = createMockToolContext(session);

      const result = await queryDiff.handler({ compareWith: 'file' }, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('fileContent required when compareWith="file"');
    });

    it('compares with provided JSON file content', async () => {
      // Create a modified version of the environment
      const otherEnv = structuredClone(sampleEnvironment);
      otherEnv.submodels![0].submodelElements![0].value = 'Different Manufacturer';

      const fileContent = Buffer.from(JSON.stringify(otherEnv)).toString('base64');
      const context = createMockToolContext(session);

      const result = await queryDiff.handler({ compareWith: 'file', fileContent }, context);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('diff');
      expect(result.data).toHaveProperty('summary');

      const summary = (result.data as any).summary;
      expect(summary.changeCount).toBeGreaterThan(0);
      expect(summary.modifications).toBeGreaterThan(0);
    });

    it('returns error for invalid base64 content', async () => {
      const context = createMockToolContext(session);

      const result = await queryDiff.handler({
        compareWith: 'file',
        fileContent: 'not-valid-base64!!!',
      }, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse provided file');
    });

    it('compares multiple undo steps back', async () => {
      // Set up two undo entries
      session.documentState!.undoStack = [
        {
          description: 'First change',
          inversePatches: [
            { op: 'replace', path: '/submodels/0/submodelElements/0/value', value: 'Original Name' },
          ],
          originalPatches: [
            { op: 'replace', path: '/submodels/0/submodelElements/0/value', value: 'First Change' },
          ],
        },
        {
          description: 'Second change',
          inversePatches: [
            { op: 'replace', path: '/submodels/0/submodelElements/0/value', value: 'First Change' },
          ],
          originalPatches: [
            { op: 'replace', path: '/submodels/0/submodelElements/0/value', value: 'ACME Corporation' },
          ],
        },
      ];

      const context = createMockToolContext(session);

      // Compare with 2 steps back (should be "Original Name")
      const result = await queryDiff.handler({ compareWith: 'undo', undoSteps: 2 }, context);

      expect(result.success).toBe(true);
      const summary = (result.data as any).summary;
      expect(summary.modifications).toBeGreaterThan(0);
    });
  });
});
