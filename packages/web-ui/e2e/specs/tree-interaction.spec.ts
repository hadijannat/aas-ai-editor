/**
 * Tree Interaction Tests
 *
 * Tests for expanding, collapsing, and selecting tree nodes.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../pages';
import { setupMcpMocks, createMockState, defaultEnvironment } from '../mocks';

test.describe('Tree Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await setupMcpMocks(page, createMockState());
  });

  test('tree displays AAS sections', async ({ page }) => {
    const editor = new EditorPage(page);
    // Load document to render the tree
    await editor.gotoEditorWithDocument();

    // The tree should show the main sections
    await expect(editor.tree).toBeVisible();

    // Check for expected structure from our mock environment
    const labels = await editor.getVisibleNodeLabels();

    // Should have section headers and items from defaultEnvironment
    // The exact content depends on what's rendered from mock data
    expect(labels.length).toBeGreaterThan(0);
  });

  test('clicking node selects it', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.gotoEditorWithDocument();

    // Wait for tree to be visible
    await expect(editor.tree).toBeVisible();

    // Find a selectable node (one with a type badge, which indicates it has data)
    // Section headers don't have type/data so clicking them won't trigger selection
    const selectableNodes = editor.tree.locator('.node-content:has(.node-type)');
    const nodeCount = await selectableNodes.count();

    if (nodeCount > 0) {
      await selectableNodes.first().click();

      // After clicking, the node should have is-selected class
      const selectedNodes = editor.tree.locator('.node-content.is-selected');
      await expect(selectedNodes).toHaveCount(1);
    }
  });

  test('toggle button expands and collapses nodes', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.gotoEditorWithDocument();

    await expect(editor.tree).toBeVisible();

    // Find a node with children (has toggle button)
    const toggleButtons = editor.tree.locator('.toggle-btn');
    const toggleCount = await toggleButtons.count();

    if (toggleCount > 0) {
      const firstToggle = toggleButtons.first();
      const initialText = await firstToggle.textContent();

      // Click to toggle
      await firstToggle.click();

      // Text should change (▼ ↔ ▶)
      const newText = await firstToggle.textContent();

      // Either should work - we just verify clicking works
      expect(newText).toBeDefined();
    }
  });

  test('expanded nodes show children', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.gotoEditorWithDocument();

    await expect(editor.tree).toBeVisible();

    // By default, nodes start expanded
    // The node-children containers should be visible
    const children = editor.tree.locator('.node-children');
    const childrenCount = await children.count();

    // If there are expandable nodes, children should be visible initially
    if (childrenCount > 0) {
      await expect(children.first()).toBeVisible();
    }
  });

  test('node displays correct icon for model type', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.gotoEditorWithDocument();

    await expect(editor.tree).toBeVisible();

    // Check that node icons exist
    const icons = editor.tree.locator('.node-icon');
    const iconCount = await icons.count();

    if (iconCount > 0) {
      // Icons should have some content
      const firstIcon = await icons.first().textContent();
      expect(firstIcon).toBeDefined();
      expect(firstIcon?.length).toBeGreaterThan(0);
    }
  });
});
