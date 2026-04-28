import { test, expect } from '@playwright/test';

// ============================================
// LESSON 1: Basic navigation and assertions
// These are the building blocks of every test
// ============================================

test('page loads and has correct title', async ({ page }) => {
  // goto = navigate to a URL
  await page.goto('https://demo.playwright.dev/todomvc/');

  // expect().toHaveTitle() checks the <title> tag
  await expect(page).toHaveTitle('React • TodoMVC');
});

test('page has the right heading', async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc/');

  // locator() finds elements on the page (like CSS selectors)
  const heading = page.locator('h1');

  // toHaveText() checks the text content
  await expect(heading).toHaveText('todos');
});

test('input placeholder is correct', async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc/');

  const input = page.locator('.new-todo');

  // toHaveAttribute() checks any HTML attribute
  await expect(input).toHaveAttribute('placeholder', 'What needs to be done?');
});
