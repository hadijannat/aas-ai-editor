/**
 * Approval Workflow Tests
 *
 * Tests for the approval panel and pending operation management.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../pages';
import { setupMcpMocks, createMockState } from '../mocks';
import type { PendingOperation } from '../mocks';

const sampleOperations: PendingOperation[] = [
  {
    id: 'op-1',
    toolName: 'edit_set_property',
    tier: 1,
    reason: 'Update manufacturer name',
    patches: [
      {
        op: 'replace',
        path: '/submodels/0/submodelElements/0/value',
        value: 'New Manufacturer',
      },
    ],
  },
  {
    id: 'op-2',
    toolName: 'edit_add',
    tier: 2,
    reason: 'Add new property',
    patches: [
      {
        op: 'add',
        path: '/submodels/0/submodelElements/-',
        value: { modelType: 'Property', idShort: 'NewProp', valueType: 'xs:string' },
      },
    ],
  },
  {
    id: 'op-3',
    toolName: 'edit_delete',
    tier: 3,
    reason: 'Remove obsolete element',
    patches: [
      {
        op: 'remove',
        path: '/submodels/0/submodelElements/2',
      },
    ],
  },
];

test.describe('Approval Workflow', () => {
  test('shows pending count badge', async ({ page }) => {
    await setupMcpMocks(
      page,
      createMockState({
        pendingOperations: sampleOperations,
      })
    );
    const editor = new EditorPage(page);

    await editor.gotoEditor();

    // Pending count should show via MCP query
    const response = await page.evaluate(async () => {
      const res = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'edit_list_pending',
            arguments: {},
          },
        }),
      });
      return res.json();
    });

    const result = JSON.parse(response.result.content[0].text);
    expect(result.pending.length).toBe(3);
  });

  test('displays operation cards with tier badges', async ({ page }) => {
    await setupMcpMocks(
      page,
      createMockState({
        pendingOperations: sampleOperations,
      })
    );
    const editor = new EditorPage(page);

    await editor.gotoEditor();

    // Verify tier display via MCP
    const response = await page.evaluate(async () => {
      const res = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'edit_list_pending',
            arguments: {},
          },
        }),
      });
      return res.json();
    });

    const result = JSON.parse(response.result.content[0].text);

    // Verify tier values
    expect(result.pending[0].tier).toBe(1);
    expect(result.pending[1].tier).toBe(2);
    expect(result.pending[2].tier).toBe(3);
  });

  test('approving operation removes it from pending', async ({ page }) => {
    const { state } = await setupMcpMocks(
      page,
      createMockState({
        pendingOperations: [...sampleOperations],
      })
    );
    const editor = new EditorPage(page);

    await editor.gotoEditor();

    // Approve first operation
    await page.evaluate(async () => {
      await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'edit_approve',
            arguments: {
              operationIds: ['op-1'],
            },
          },
        }),
      });
    });

    // Should now have 2 pending
    expect(state.pendingOperations.length).toBe(2);
    expect(state.pendingOperations.find((op) => op.id === 'op-1')).toBeUndefined();
  });

  test('rejecting operation removes it from pending', async ({ page }) => {
    const { state } = await setupMcpMocks(
      page,
      createMockState({
        pendingOperations: [...sampleOperations],
      })
    );
    const editor = new EditorPage(page);

    await editor.gotoEditor();

    // Reject second operation
    await page.evaluate(async () => {
      await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'edit_reject',
            arguments: {
              operationIds: ['op-2'],
            },
          },
        }),
      });
    });

    // Should now have 2 pending
    expect(state.pendingOperations.length).toBe(2);
    expect(state.pendingOperations.find((op) => op.id === 'op-2')).toBeUndefined();
  });

  test('approve all clears all pending operations', async ({ page }) => {
    const { state } = await setupMcpMocks(
      page,
      createMockState({
        pendingOperations: [...sampleOperations],
      })
    );
    const editor = new EditorPage(page);

    await editor.gotoEditor();

    // Approve all
    await page.evaluate(async () => {
      await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'edit_approve',
            arguments: {
              operationIds: ['op-1', 'op-2', 'op-3'],
            },
          },
        }),
      });
    });

    // Should now have 0 pending
    expect(state.pendingOperations.length).toBe(0);

    // Document should be dirty after approval
    expect(state.dirty).toBe(true);
    expect(state.canUndo).toBe(true);
  });

  test('reject all clears all pending operations', async ({ page }) => {
    const { state } = await setupMcpMocks(
      page,
      createMockState({
        pendingOperations: [...sampleOperations],
      })
    );
    const editor = new EditorPage(page);

    await editor.gotoEditor();

    // Reject all
    await page.evaluate(async () => {
      await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'edit_reject',
            arguments: {
              operationIds: ['op-1', 'op-2', 'op-3'],
            },
          },
        }),
      });
    });

    // Should now have 0 pending
    expect(state.pendingOperations.length).toBe(0);

    // Document should NOT be dirty after reject (no changes applied)
    expect(state.dirty).toBe(false);
  });

  test('operation patches are included in response', async ({ page }) => {
    await setupMcpMocks(
      page,
      createMockState({
        pendingOperations: sampleOperations,
      })
    );
    const editor = new EditorPage(page);

    await editor.gotoEditor();

    // Query pending operations
    const response = await page.evaluate(async () => {
      const res = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'edit_list_pending',
            arguments: {},
          },
        }),
      });
      return res.json();
    });

    const result = JSON.parse(response.result.content[0].text);

    // First operation should have patches
    expect(result.pending[0].patches).toBeDefined();
    expect(result.pending[0].patches.length).toBe(1);
    expect(result.pending[0].patches[0].op).toBe('replace');
  });
});
