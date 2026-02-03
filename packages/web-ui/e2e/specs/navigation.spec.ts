/**
 * Navigation Tests
 *
 * Tests for route navigation between views.
 */

import { test, expect } from '@playwright/test';
import { BasePage } from '../pages';
import { setupMcpMocks } from '../mocks';

test.describe('Navigation', () => {
  test('navigates to editor view by default', async ({ page }) => {
    await setupMcpMocks(page);
    const basePage = new BasePage(page);

    await basePage.goto('/');

    expect(await basePage.getCurrentPath()).toBe('/');
  });

  test('navigates to import view', async ({ page }) => {
    await setupMcpMocks(page);
    const basePage = new BasePage(page);

    await basePage.goto('/import');

    expect(await basePage.getCurrentPath()).toBe('/import');
  });

  test('navigates to settings view', async ({ page }) => {
    await setupMcpMocks(page);
    const basePage = new BasePage(page);

    await basePage.goto('/settings');

    expect(await basePage.getCurrentPath()).toBe('/settings');
  });

  test('navigation between routes works', async ({ page }) => {
    await setupMcpMocks(page);
    const basePage = new BasePage(page);

    // Start at editor
    await basePage.goto('/');
    expect(await basePage.getCurrentPath()).toBe('/');

    // Go to import
    await basePage.goto('/import');
    expect(await basePage.getCurrentPath()).toBe('/import');

    // Go to settings
    await basePage.goto('/settings');
    expect(await basePage.getCurrentPath()).toBe('/settings');

    // Back to editor
    await basePage.goto('/');
    expect(await basePage.getCurrentPath()).toBe('/');
  });
});
