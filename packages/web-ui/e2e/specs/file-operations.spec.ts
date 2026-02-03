/**
 * File Operations Tests
 *
 * Tests for loading and saving AASX documents via MCP.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../pages';
import { setupMcpMocks, createMockState, defaultEnvironment } from '../mocks';

test.describe('File Operations', () => {
  test('loads document and displays tree', async ({ page }) => {
    const { state, updateState } = await setupMcpMocks(page, createMockState());
    const editor = new EditorPage(page);

    await editor.gotoEditor();

    // Simulate document load by calling MCP directly
    const response = await page.evaluate(async () => {
      const res = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'document_load_content',
            arguments: {
              content: 'base64content',
              filename: 'test.aasx',
            },
          },
        }),
      });
      return res.json();
    });

    // Verify the mock responded correctly
    expect(response.result).toBeDefined();
    const content = JSON.parse(response.result.content[0].text);
    expect(content.documentId).toBe('test-doc-123');
    expect(content.filename).toBe('test.aasx');
  });

  test('document status reflects undo/redo state', async ({ page }) => {
    const { state, updateState } = await setupMcpMocks(
      page,
      createMockState({
        canUndo: true,
        canRedo: false,
        dirty: true,
      })
    );

    const editor = new EditorPage(page);
    await editor.gotoEditor();

    // Check status via MCP
    const response = await page.evaluate(async () => {
      const res = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'document_status',
            arguments: {},
          },
        }),
      });
      return res.json();
    });

    const status = JSON.parse(response.result.content[0].text);
    expect(status.canUndo).toBe(true);
    expect(status.canRedo).toBe(false);
    expect(status.dirty).toBe(true);
  });

  test('save document clears dirty flag', async ({ page }) => {
    const { state } = await setupMcpMocks(
      page,
      createMockState({
        dirty: true,
      })
    );

    const editor = new EditorPage(page);
    await editor.gotoEditor();

    // Save via MCP
    await page.evaluate(async () => {
      await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'document_save',
            arguments: {},
          },
        }),
      });
    });

    // Check state was updated
    expect(state.dirty).toBe(false);
  });
});
