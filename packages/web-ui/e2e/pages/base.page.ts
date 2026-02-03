/**
 * Base Page Object
 *
 * Provides common functionality for all page objects.
 */

import type { Page, Locator } from '@playwright/test';

export class BasePage {
  readonly page: Page;

  // Common UI elements
  readonly header: Locator;
  readonly sidebar: Locator;
  readonly mainContent: Locator;
  readonly notifications: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = page.locator('.app-header');
    this.sidebar = page.locator('.app-sidebar');
    this.mainContent = page.locator('.main-content, main');
    this.notifications = page.locator('.notification-toast');
  }

  /**
   * Navigate to a path
   */
  async goto(path: string = '/') {
    await this.page.goto(path);
  }

  /**
   * Wait for the application to be ready
   */
  async waitForReady() {
    // Wait for the main app container to be visible
    await this.page.waitForSelector('#app', { state: 'visible' });
  }

  /**
   * Get the current route path
   */
  async getCurrentPath(): Promise<string> {
    return new URL(this.page.url()).pathname;
  }

  /**
   * Wait for a notification to appear
   */
  async waitForNotification(textPattern?: string | RegExp) {
    if (textPattern) {
      await this.notifications
        .filter({ hasText: textPattern })
        .first()
        .waitFor({ state: 'visible' });
    } else {
      await this.notifications.first().waitFor({ state: 'visible' });
    }
  }

  /**
   * Check if a notification with specific text exists
   */
  async hasNotification(textPattern: string | RegExp): Promise<boolean> {
    const notification = this.notifications.filter({ hasText: textPattern });
    return (await notification.count()) > 0;
  }

  /**
   * Click a button by text
   */
  async clickButton(text: string) {
    await this.page.getByRole('button', { name: text }).click();
  }

  /**
   * Click a link by text
   */
  async clickLink(text: string) {
    await this.page.getByRole('link', { name: text }).click();
  }

  /**
   * Take a screenshot for debugging
   */
  async screenshot(name: string) {
    await this.page.screenshot({
      path: `e2e/test-results/screenshots/${name}.png`,
    });
  }
}
