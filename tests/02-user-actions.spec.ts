import { test, expect } from '@playwright/test';

// ============================================
// LESSON 2: Simulating user actions
// fill, click, keyboard, check
// ============================================

test('can add a todo item', async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc/');

  // fill() types into an input
  await page.locator('.new-todo').fill('Learn Playwright');

  // press Enter to submit
  await page.locator('.new-todo').press('Enter');

  // check that the todo appeared in the list
  const todoItem = page.locator('.todo-list li');
  await expect(todoItem).toHaveText('Learn Playwright');
});

test('can add multiple todos', async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc/');

  const input = page.locator('.new-todo');

  await input.fill('First task');
  await input.press('Enter');

  await input.fill('Second task');
  await input.press('Enter');

  await input.fill('Third task');
  await input.press('Enter');

  // toHaveCount() checks how many elements match the locator
  const todos = page.locator('.todo-list li');
  await expect(todos).toHaveCount(3);
});

test('can mark a todo as complete', async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc/');

  // add a todo first
  await page.locator('.new-todo').fill('Buy groceries');
  await page.locator('.new-todo').press('Enter');

  // click the checkbox to complete it
  await page.locator('.todo-list li .toggle').click();

  // check that it has the "completed" class
  const todoItem = page.locator('.todo-list li');
  await expect(todoItem).toHaveClass(/completed/);
});

test('can delete a todo', async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc/');

  await page.locator('.new-todo').fill('Delete me');
  await page.locator('.new-todo').press('Enter');

  // hover to reveal the delete button (it's hidden until hover)
  await page.locator('.todo-list li').hover();
  await page.locator('.todo-list li .destroy').click();

  // should be empty now
  await expect(page.locator('.todo-list li')).toHaveCount(0);
});
