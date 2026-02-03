/**
 * Tests for Edit Tools
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { editTools } from '../../src/tools/edit.js';
import {
  createMockSession,
  createEmptySession,
  createMockToolContext,
  sampleEnvironment,
} from './test-helpers.js';
import type { SessionData, PendingOperation } from '../../src/types.js';
import type { Environment } from '@aas-ai-editor/core';

// Get individual tools
const setProperty = editTools.find((t) => t.name === 'edit_set_property')!;
const addElement = editTools.find((t) => t.name === 'edit_add_element')!;
const removeElement = editTools.find((t) => t.name === 'edit_remove_element')!;
const approve = editTools.find((t) => t.name === 'edit_approve')!;
const reject = editTools.find((t) => t.name === 'edit_reject')!;
const listPending = editTools.find((t) => t.name === 'edit_list_pending')!;

describe('Edit Tools', () => {
  let session: SessionData;

  beforeEach(() => {
    session = createMockSession(structuredClone(sampleEnvironment));
  });

  describe('edit_set_property', () => {
    it('returns error when no document is loaded', async () => {
      const emptySession = createEmptySession();
      const context = createMockToolContext(emptySession);

      const result = await setProperty.handler(
        { path: '/submodels/0/submodelElements/0/value', value: 'New Value' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('No document loaded');
    });

    it('auto-applies LOW tier changes (description changes)', async () => {
      // First add a description to the submodel so we can replace it
      const env = session.documentState?.environment as Environment;
      env.submodels![0].description = [{ language: 'en', text: 'Original description' }];

      const context = createMockToolContext(session);

      // Description changes are LOW tier and auto-apply
      const result = await setProperty.handler(
        {
          path: '/submodels/0/description',
          value: [{ language: 'en', text: 'Updated description' }],
          reason: 'Update description',
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('autoApplied', true);
      expect(result.data).toHaveProperty('tier', 'LOW');

      // Should be added to undo stack
      expect(session.documentState?.undoStack.length).toBe(1);
      // Should NOT be in pending operations
      expect(session.pendingOperations.length).toBe(0);
    });

    it('queues MEDIUM tier changes for approval', async () => {
      const context = createMockToolContext(session);

      // Value changes are MEDIUM tier and require approval
      const result = await setProperty.handler(
        {
          path: '/submodels/0/submodelElements/0/value',
          value: 'New Manufacturer Name',
          reason: 'Update manufacturer name',
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('requiresApproval', true);
      expect(result.data).toHaveProperty('tier', 'MEDIUM');
      expect(result.data).toHaveProperty('operationId');

      // Should be in pending operations
      expect(session.pendingOperations.length).toBe(1);
      expect(session.pendingOperations[0].reason).toBe('Update manufacturer name');
    });
  });

  describe('edit_add_element', () => {
    it('validates element has required fields', async () => {
      const context = createMockToolContext(session);

      const result = await addElement.handler(
        {
          path: '/submodels/0/submodelElements/-',
          element: { value: 'test' }, // Missing modelType and idShort
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('modelType');
    });

    it('queues element addition for approval', async () => {
      const context = createMockToolContext(session);

      const result = await addElement.handler(
        {
          path: '/submodels/0/submodelElements/-',
          element: {
            modelType: 'Property',
            idShort: 'SerialNumber',
            valueType: 'xs:string',
            value: 'SN-12345',
          },
          reason: 'Add serial number property',
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('requiresApproval', true);
      expect(result.data).toHaveProperty('operationId');

      expect(session.pendingOperations.length).toBe(1);
      expect(session.pendingOperations[0].toolName).toBe('edit_add_element');
    });
  });

  describe('edit_remove_element', () => {
    it('queues removal with HIGH tier', async () => {
      const context = createMockToolContext(session);

      const result = await removeElement.handler(
        {
          path: '/submodels/0/submodelElements/1',
          reason: 'Remove obsolete property',
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('requiresApproval', true);
      expect(result.data).toHaveProperty('tier', 'HIGH');

      expect(session.pendingOperations.length).toBe(1);
    });
  });

  describe('edit_approve', () => {
    it('applies approved operations to the environment', async () => {
      const context = createMockToolContext(session);

      // First, queue a change
      await setProperty.handler(
        {
          path: '/submodels/0/submodelElements/0/value',
          value: 'Updated ACME Corp',
        },
        context
      );

      expect(session.pendingOperations.length).toBe(1);
      const operationId = session.pendingOperations[0].id;

      // Now approve it
      const result = await approve.handler(
        { operationIds: [operationId] },
        context
      );

      expect(result.success).toBe(true);
      expect((result.data as any).approved).toContain(operationId);
      expect((result.data as any).remainingCount).toBe(0);

      // Verify the change was applied
      const env = session.documentState?.environment as Environment;
      expect(env.submodels?.[0].submodelElements?.[0].value).toBe('Updated ACME Corp');

      // Should be in undo stack
      expect(session.documentState?.undoStack.length).toBe(1);

      // Document should be dirty
      expect(session.documentState?.dirty).toBe(true);
    });

    it('approves all operations with "all"', async () => {
      const context = createMockToolContext(session);

      // Queue multiple changes
      await setProperty.handler(
        { path: '/submodels/0/submodelElements/0/value', value: 'Value 1' },
        context
      );
      await setProperty.handler(
        { path: '/submodels/0/submodelElements/1/value', value: 'Value 2' },
        context
      );

      expect(session.pendingOperations.length).toBe(2);

      // Approve all
      const result = await approve.handler(
        { operationIds: 'all' },
        context
      );

      expect(result.success).toBe(true);
      expect((result.data as any).approved.length).toBe(2);
      expect((result.data as any).remainingCount).toBe(0);
    });
  });

  describe('edit_reject', () => {
    it('removes rejected operations from pending', async () => {
      const context = createMockToolContext(session);

      // Queue a change
      await setProperty.handler(
        {
          path: '/submodels/0/submodelElements/0/value',
          value: 'Rejected Value',
        },
        context
      );

      const operationId = session.pendingOperations[0].id;

      // Reject it
      const result = await reject.handler(
        { operationIds: [operationId], reason: 'Invalid change' },
        context
      );

      expect(result.success).toBe(true);
      expect((result.data as any).rejected).toContain(operationId);
      expect(session.pendingOperations.length).toBe(0);

      // Verify the change was NOT applied
      const env = session.documentState?.environment as Environment;
      expect(env.submodels?.[0].submodelElements?.[0].value).toBe('ACME Corporation');
    });
  });

  describe('edit_list_pending', () => {
    it('lists all pending operations', async () => {
      const context = createMockToolContext(session);

      // Queue some changes
      await setProperty.handler(
        { path: '/submodels/0/submodelElements/0/value', value: 'Change 1' },
        context
      );
      await addElement.handler(
        {
          path: '/submodels/0/submodelElements/-',
          element: { modelType: 'Property', idShort: 'New', valueType: 'xs:string' },
        },
        context
      );

      const result = await listPending.handler({}, context);

      expect(result.success).toBe(true);
      const pending = (result.data as any).pending;
      expect(pending.length).toBe(2);
      expect(pending[0].toolName).toBe('edit_set_property');
      expect(pending[1].toolName).toBe('edit_add_element');
    });
  });
});
