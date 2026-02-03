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

    await editor.gotoEditor();

    // Tree component should be present
    await expect(editor.tree).toBeVisible();
  });

  test('approval panel renders', async ({ page }) => {
    await setupMcpMocks(page);
    const editor = new EditorPage(page);

    await editor.gotoEditor();

    // Approval panel should be present
    await expect(editor.approvalPanel).toBeVisible();
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
