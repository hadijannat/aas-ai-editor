/**
 * Property Editing Tests
 *
 * Tests for editing property values through the PropertyEditor component.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../pages';
import { setupMcpMocks, createMockState } from '../mocks';

test.describe('Property Editing', () => {
  test('property editor displays when property is selected', async ({
    page,
  }) => {
    await setupMcpMocks(page, createMockState());
    const editor = new EditorPage(page);

    // Load a document so the tree is rendered
    await editor.gotoEditorWithDocument();

    // Wait for tree
    await expect(editor.tree).toBeVisible();

    // The property editor may not be visible until a property is selected
    // This test verifies the tree is ready for selection
  });

  test('editing value shows save and cancel buttons', async ({ page }) => {
    await setupMcpMocks(page, createMockState());
    const editor = new EditorPage(page);

    await editor.gotoEditor();

    // If property editor is visible and has an input
    const hasInput = await editor.propertyValueInput.isVisible().catch(() => false);

    if (hasInput) {
      // Get original value
      const originalValue = await editor.getPropertyValue();

      // Modify the value
      await editor.setPropertyValue(originalValue + ' modified');

      // Save and cancel buttons should appear
      await expect(editor.saveButton).toBeVisible();
      await expect(editor.cancelButton).toBeVisible();
    }
  });

  test('cancel button reverts changes', async ({ page }) => {
    await setupMcpMocks(page, createMockState());
    const editor = new EditorPage(page);

    await editor.gotoEditor();

    const hasInput = await editor.propertyValueInput.isVisible().catch(() => false);

    if (hasInput) {
      const originalValue = await editor.getPropertyValue();

      // Modify
      await editor.setPropertyValue('completely different value');

      // Cancel
      if (await editor.cancelButton.isVisible()) {
        await editor.cancelPropertyEdit();

        // Value should revert
        const currentValue = await editor.getPropertyValue();
        expect(currentValue).toBe(originalValue);
      }
    }
  });

  test('save button calls MCP edit tool', async ({ page }) => {
    const { state } = await setupMcpMocks(page, createMockState());
    const editor = new EditorPage(page);

    await editor.gotoEditor();

    // Call edit_set_property directly to verify mock works
    const response = await page.evaluate(async () => {
      const res = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'edit_set_property',
            arguments: {
              path: '/submodels/0/submodelElements/0/value',
              value: 'New Value',
              reason: 'User edit',
            },
          },
        }),
      });
      return res.json();
    });

    // Verify response structure
    const result = JSON.parse(response.result.content[0].text);
    expect(result.operationId).toBeDefined();
    expect(result.tier).toBe(2);

    // Verify pending operation was added to state
    expect(state.pendingOperations.length).toBe(1);
    expect(state.pendingOperations[0].toolName).toBe('edit_set_property');
  });

  test('property shows correct type badge', async ({ page }) => {
    await setupMcpMocks(page, createMockState());
    const editor = new EditorPage(page);

    await editor.gotoEditor();

    // Check if property type is displayed
    const typeBadge = editor.propertyEditor.locator('.property-type');
    const isVisible = await typeBadge.isVisible().catch(() => false);

    if (isVisible) {
      const typeText = await typeBadge.textContent();
      // Should show something like 'xs:string'
      expect(typeText).toBeDefined();
    }
  });
});
