import { test, expect } from '@playwright/test';

// ============================================
// LESSON 3: Edge cases and trickier scenarios
// This is where QA engineers really shine
// ============================================

test('empty todo should not be added', async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc/');

  // try to submit an empty todo
  await page.locator('.new-todo').press('Enter');

  // nothing should appear
  await expect(page.locator('.todo-list li')).toHaveCount(0);
});

test('todo with only spaces should not be added', async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc/');

  await page.locator('.new-todo').fill('   ');
  await page.locator('.new-todo').press('Enter');

  await expect(page.locator('.todo-list li')).toHaveCount(0);
});

test('todo counter updates correctly', async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc/');

  const input = page.locator('.new-todo');

  await input.fill('Task 1');
  await input.press('Enter');
  await input.fill('Task 2');
  await input.press('Enter');

  // check the "X items left" counter
  const counter = page.locator('.todo-count');
  await expect(counter).toHaveText('2 items left');

  // complete one
  await page.locator('.todo-list li .toggle').first().click();

  // counter should update
  await expect(counter).toHaveText('1 item left');
});

test('filters work correctly', async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc/');

  const input = page.locator('.new-todo');

  // add two todos, complete one
  await input.fill('Active task');
  await input.press('Enter');
  await input.fill('Done task');
  await input.press('Enter');
  await page.locator('.todo-list li .toggle').last().click();

  // click "Active" filter
  await page.locator('text=Active').click();
  await expect(page.locator('.todo-list li')).toHaveCount(1);
  await expect(page.locator('.todo-list li')).toHaveText('Active task');

  // click "Completed" filter
  await page.locator('text=Completed').click();
  await expect(page.locator('.todo-list li')).toHaveCount(1);
  await expect(page.locator('.todo-list li')).toHaveText('Done task');

  // click "All" filter
  await page.locator('text=All').click();
  await expect(page.locator('.todo-list li')).toHaveCount(2);
});
