/**
 * Smoke Tests
 *
 * Basic tests to verify the application loads and core elements are present.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../pages';
import { setupMcpMocks, createMockState } from '../mocks';

test.describe('Smoke Tests', () => {
  test('application loads successfully', async ({ page }) => {
    await setupMcpMocks(page);
    const editor = new EditorPage(page);

    await editor.gotoEditor();

    // Verify the app container is present
    await expect(page.locator('#app')).toBeVisible();
  });

  test('main layout elements are present', async ({ page }) => {
    await setupMcpMocks(page);
    const editor = new EditorPage(page);

    await editor.gotoEditor();

    // The app should have basic structure
    await expect(page.locator('#app')).toBeVisible();
  });

  test('tree component renders', async ({ page }) => {
    await setupMcpMocks(page);
    const editor = new EditorPage(page);

    // Load a document so the tree is rendered
    await editor.gotoEditorWithDocument();

    // Tree component should be present
    await expect(editor.tree).toBeVisible();
  });

  test('approval panel renders when pending operations exist', async ({ page }) => {
    // Set up mocks with pending operations
    await setupMcpMocks(
      page,
      createMockState({
        pendingOperations: [
          {
            id: 'op-1',
            toolName: 'edit_set_property',
            tier: 1,
            reason: 'Test operation',
            patches: [{ op: 'replace', path: '/test', value: 'value' }],
          },
        ],
      })
    );
    const editor = new EditorPage(page);

    // Load document
    await editor.gotoEditorWithDocument();

    // Inject pending operations into the store using the exposed pinia
    await page.evaluate(() => {
      const pinia = (window as unknown as { __pinia__?: { state: { value: { document?: { pendingOperations?: unknown[] } } } } }).__pinia__;
      if (pinia?.state?.value?.document) {
        // Use Vue's reactivity system by replacing the array reference
        const ops = [
          {
            id: 'op-1',
            toolName: 'edit_set_property',
            tier: 1,
            reason: 'Test operation',
            createdAt: new Date().toISOString(),
            patches: [{ op: 'replace', path: '/test', value: 'value' }],
          },
        ];
        // Force reactivity by using Object.assign
        Object.assign(pinia.state.value.document, { pendingOperations: ops });
      }
    });

    // Wait for Vue reactivity to propagate
    await page.waitForTimeout(200);

    // Approval panel should be present now
    await expect(editor.approvalPanel).toBeVisible({ timeout: 2000 });
  });

  test('MCP mock handler intercepts requests', async ({ page }) => {
    const { state } = await setupMcpMocks(page);

    await page.goto('/');

    // Make a test request to verify mocking works
    const response = await page.evaluate(async () => {
      const res = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        }),
      });
      return res.json();
    });

    expect(response).toHaveProperty('result');
    expect(response.result).toHaveProperty('serverInfo');
    expect(response.result.serverInfo.name).toBe('aas-ai-editor-mcp-mock');
  });
});
