/**
 * Editor Page Object
 *
 * Page object for the main editor view, including tree navigation,
 * property editing, and approval workflow.
 */

import type { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class EditorPage extends BasePage {
  // Tree navigation
  readonly tree: Locator;
  readonly treeNodes: Locator;

  // Property editor
  readonly propertyEditor: Locator;
  readonly propertyValueInput: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  // Approval panel
  readonly approvalPanel: Locator;
  readonly pendingCountBadge: Locator;
  readonly operationCards: Locator;
  readonly approveAllButton: Locator;
  readonly rejectAllButton: Locator;

  // File operations
  readonly openFileButton: Locator;
  readonly saveFileButton: Locator;
  readonly undoButton: Locator;
  readonly redoButton: Locator;

  constructor(page: Page) {
    super(page);

    // Tree selectors (from AasTree.vue and TreeNode.vue)
    this.tree = page.locator('.aas-tree');
    this.treeNodes = page.locator('.tree-node');

    // Property editor selectors (from PropertyEditor.vue)
    this.propertyEditor = page.locator('.property-editor');
    this.propertyValueInput = this.propertyEditor.locator('.value-input input');
    this.saveButton = this.propertyEditor.getByRole('button', { name: 'Save' });
    this.cancelButton = this.propertyEditor.getByRole('button', {
      name: 'Cancel',
    });

    // Approval panel selectors (from ApprovalPanel.vue)
    this.approvalPanel = page.locator('.approval-panel');
    this.pendingCountBadge = this.approvalPanel.locator('.count-badge');
    this.operationCards = this.approvalPanel.locator('.operation-card');
    this.approveAllButton = this.approvalPanel.getByRole('button', {
      name: 'Approve All',
    });
    this.rejectAllButton = this.approvalPanel.getByRole('button', {
      name: 'Reject All',
    });

    // Toolbar buttons
    this.openFileButton = page.getByRole('button', { name: /open/i });
    this.saveFileButton = page.getByRole('button', { name: /save/i });
    this.undoButton = page.getByRole('button', { name: /undo/i });
    this.redoButton = page.getByRole('button', { name: /redo/i });
  }

  /**
   * Navigate to the editor view
   */
  async gotoEditor() {
    await this.goto('/');
    await this.waitForReady();
  }

  /**
   * Load a mock document by injecting environment data into the store.
   * This simulates the effect of loading a document via MCP.
   */
  async loadMockDocument() {
    await this.page.evaluate(async () => {
      // First, fetch the environment from MCP mock
      const response = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'resources/read',
          params: { uri: 'aas://environment' },
        }),
      });
      const data = await response.json();
      const env = JSON.parse(data.result.contents[0].content);

      // Get Pinia store exposed for tests
      const pinia = (window as unknown as { __pinia__?: { state: { value: { document?: { environment?: unknown; documentId?: string; filename?: string } } } } }).__pinia__;
      if (pinia?.state?.value?.document) {
        pinia.state.value.document.environment = env;
        pinia.state.value.document.documentId = 'test-doc-123';
        pinia.state.value.document.filename = 'test.aasx';
      }
    });

    // Wait for Vue reactivity to propagate
    await this.page.waitForTimeout(100);
  }

  /**
   * Navigate to editor and load a mock document
   */
  async gotoEditorWithDocument() {
    await this.goto('/');
    await this.waitForReady();
    await this.loadMockDocument();
    // Wait for tree to render
    await this.tree.waitFor({ state: 'visible', timeout: 5000 });
  }

  // --- Tree Navigation ---

  /**
   * Get a tree node by its label text
   */
  getTreeNodeByLabel(label: string): Locator {
    return this.tree.locator('.node-content', { hasText: label });
  }

  /**
   * Click on a tree node to select it
   */
  async selectTreeNode(label: string) {
    const node = this.getTreeNodeByLabel(label);
    await node.click();
  }

  /**
   * Expand a tree node (click the toggle button)
   */
  async expandTreeNode(label: string) {
    const node = this.getTreeNodeByLabel(label);
    const toggle = node.locator('.toggle-btn');

    // Only click if collapsed (shows ▶)
    const text = await toggle.textContent();
    if (text?.includes('▶')) {
      await toggle.click();
    }
  }

  /**
   * Collapse a tree node
   */
  async collapseTreeNode(label: string) {
    const node = this.getTreeNodeByLabel(label);
    const toggle = node.locator('.toggle-btn');

    // Only click if expanded (shows ▼)
    const text = await toggle.textContent();
    if (text?.includes('▼')) {
      await toggle.click();
    }
  }

  /**
   * Check if a tree node is selected
   */
  async isTreeNodeSelected(label: string): Promise<boolean> {
    const node = this.getTreeNodeByLabel(label);
    const classes = await node.getAttribute('class');
    return classes?.includes('is-selected') ?? false;
  }

  /**
   * Check if a tree node is expanded
   */
  async isTreeNodeExpanded(label: string): Promise<boolean> {
    const node = this.getTreeNodeByLabel(label);
    const toggle = node.locator('.toggle-btn');
    const text = await toggle.textContent();
    return text?.includes('▼') ?? false;
  }

  /**
   * Get all visible tree node labels
   */
  async getVisibleNodeLabels(): Promise<string[]> {
    const labels = await this.tree.locator('.node-label').allTextContents();
    return labels;
  }

  // --- Property Editing ---

  /**
   * Get the current property name being edited
   */
  async getPropertyName(): Promise<string | null> {
    const name = this.propertyEditor.locator('.property-name');
    if ((await name.count()) === 0) return null;
    return name.textContent();
  }

  /**
   * Get the current property value
   */
  async getPropertyValue(): Promise<string> {
    return this.propertyValueInput.inputValue();
  }

  /**
   * Set the property value
   */
  async setPropertyValue(value: string) {
    await this.propertyValueInput.fill(value);
  }

  /**
   * Save the current property edit
   */
  async saveProperty() {
    await this.saveButton.click();
  }

  /**
   * Cancel the current property edit
   */
  async cancelPropertyEdit() {
    await this.cancelButton.click();
  }

  /**
   * Check if save button is visible (indicates changes)
   */
  async hasUnsavedChanges(): Promise<boolean> {
    return this.saveButton.isVisible();
  }

  // --- Approval Workflow ---

  /**
   * Get the pending operation count
   */
  async getPendingCount(): Promise<number> {
    const text = await this.pendingCountBadge.textContent();
    return parseInt(text || '0', 10);
  }

  /**
   * Get operation card by index
   */
  getOperationCard(index: number): Locator {
    return this.operationCards.nth(index);
  }

  /**
   * Get the tier badge text for an operation
   */
  async getOperationTier(index: number): Promise<string> {
    const card = this.getOperationCard(index);
    return (await card.locator('.tier-badge').textContent()) || '';
  }

  /**
   * Get the reason text for an operation
   */
  async getOperationReason(index: number): Promise<string> {
    const card = this.getOperationCard(index);
    return (await card.locator('.operation-reason').textContent()) || '';
  }

  /**
   * Expand operation diff
   */
  async expandOperationDiff(index: number) {
    const card = this.getOperationCard(index);
    const toggle = card.locator('.expand-toggle');
    await toggle.click();
  }

  /**
   * Check if operation diff is visible
   */
  async isOperationDiffVisible(index: number): Promise<boolean> {
    const card = this.getOperationCard(index);
    return card.locator('.operation-diff').isVisible();
  }

  /**
   * Approve a specific operation
   */
  async approveOperation(index: number) {
    const card = this.getOperationCard(index);
    await card.getByRole('button', { name: 'Approve' }).click();
  }

  /**
   * Reject a specific operation
   */
  async rejectOperation(index: number) {
    const card = this.getOperationCard(index);
    await card.getByRole('button', { name: 'Reject' }).click();
  }

  /**
   * Approve all pending operations
   */
  async approveAllOperations() {
    await this.approveAllButton.click();
  }

  /**
   * Reject all pending operations
   */
  async rejectAllOperations() {
    await this.rejectAllButton.click();
  }

  // --- File Operations ---

  /**
   * Wait for document to be loaded
   */
  async waitForDocumentLoaded() {
    // Wait for tree to have content
    await this.tree.locator('.tree-node').first().waitFor({ state: 'visible' });
  }

  /**
   * Check if undo is available
   */
  async canUndo(): Promise<boolean> {
    return this.undoButton.isEnabled();
  }

  /**
   * Check if redo is available
   */
  async canRedo(): Promise<boolean> {
    return this.redoButton.isEnabled();
  }

  /**
   * Perform undo
   */
  async undo() {
    await this.undoButton.click();
  }

  /**
   * Perform redo
   */
  async redo() {
    await this.redoButton.click();
  }
}
