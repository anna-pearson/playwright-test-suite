# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 03-edge-cases.spec.ts >> filters work correctly
- Location: tests/03-edge-cases.spec.ts:48:5

# Error details

```
Error: locator.click: Error: strict mode violation: locator('text=Active') resolved to 2 elements:
    1) <label data-testid="todo-title">Active task</label> aka getByText('Active task')
    2) <a class="" href="#/active">Active</a> aka getByRole('link', { name: 'Active' })

Call log:
  - waiting for locator('text=Active')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - text: This is just a demo of TodoMVC for testing, not the
    - link "real TodoMVC app." [ref=e3] [cursor=pointer]:
      - /url: https://todomvc.com/
  - generic [ref=e5]:
    - generic [ref=e6]:
      - heading "todos" [level=1] [ref=e7]
      - textbox "What needs to be done?" [ref=e8]
    - generic [ref=e9]:
      - checkbox "❯Mark all as complete" [ref=e10]
      - generic [ref=e11]: ❯Mark all as complete
      - list [ref=e12]:
        - listitem [ref=e13]:
          - generic [ref=e14]:
            - checkbox "Toggle Todo" [ref=e15]
            - generic [ref=e16]: Active task
            - text: ×
        - listitem [ref=e17]:
          - generic [ref=e18]:
            - checkbox "Toggle Todo" [checked] [active] [ref=e19]
            - generic [ref=e20]: Done task
            - button "Delete" [ref=e21]: ×
    - generic [ref=e22]:
      - generic [ref=e23]:
        - strong [ref=e24]: "1"
        - text: item left
      - list [ref=e25]:
        - listitem [ref=e26]:
          - link "All" [ref=e27] [cursor=pointer]:
            - /url: "#/"
        - listitem [ref=e28]:
          - link "Active" [ref=e29] [cursor=pointer]:
            - /url: "#/active"
        - listitem [ref=e30]:
          - link "Completed" [ref=e31] [cursor=pointer]:
            - /url: "#/completed"
      - button "Clear completed" [ref=e32] [cursor=pointer]
  - contentinfo [ref=e33]:
    - paragraph [ref=e34]: Double-click to edit a todo
    - paragraph [ref=e35]:
      - text: Created by
      - link "Remo H. Jansen" [ref=e36] [cursor=pointer]:
        - /url: http://github.com/remojansen/
    - paragraph [ref=e37]:
      - text: Part of
      - link "TodoMVC" [ref=e38] [cursor=pointer]:
        - /url: http://todomvc.com
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | // ============================================
  4  | // LESSON 3: Edge cases and trickier scenarios
  5  | // This is where QA engineers really shine
  6  | // ============================================
  7  | 
  8  | test('empty todo should not be added', async ({ page }) => {
  9  |   await page.goto('https://demo.playwright.dev/todomvc/');
  10 | 
  11 |   // try to submit an empty todo
  12 |   await page.locator('.new-todo').press('Enter');
  13 | 
  14 |   // nothing should appear
  15 |   await expect(page.locator('.todo-list li')).toHaveCount(0);
  16 | });
  17 | 
  18 | test('todo with only spaces should not be added', async ({ page }) => {
  19 |   await page.goto('https://demo.playwright.dev/todomvc/');
  20 | 
  21 |   await page.locator('.new-todo').fill('   ');
  22 |   await page.locator('.new-todo').press('Enter');
  23 | 
  24 |   await expect(page.locator('.todo-list li')).toHaveCount(0);
  25 | });
  26 | 
  27 | test('todo counter updates correctly', async ({ page }) => {
  28 |   await page.goto('https://demo.playwright.dev/todomvc/');
  29 | 
  30 |   const input = page.locator('.new-todo');
  31 | 
  32 |   await input.fill('Task 1');
  33 |   await input.press('Enter');
  34 |   await input.fill('Task 2');
  35 |   await input.press('Enter');
  36 | 
  37 |   // check the "X items left" counter
  38 |   const counter = page.locator('.todo-count');
  39 |   await expect(counter).toHaveText('2 items left');
  40 | 
  41 |   // complete one
  42 |   await page.locator('.todo-list li .toggle').first().click();
  43 | 
  44 |   // counter should update
  45 |   await expect(counter).toHaveText('1 item left');
  46 | });
  47 | 
  48 | test('filters work correctly', async ({ page }) => {
  49 |   await page.goto('https://demo.playwright.dev/todomvc/');
  50 | 
  51 |   const input = page.locator('.new-todo');
  52 | 
  53 |   // add two todos, complete one
  54 |   await input.fill('Active task');
  55 |   await input.press('Enter');
  56 |   await input.fill('Done task');
  57 |   await input.press('Enter');
  58 |   await page.locator('.todo-list li .toggle').last().click();
  59 | 
  60 |   // click "Active" filter
> 61 |   await page.locator('text=Active').click();
     |                                     ^ Error: locator.click: Error: strict mode violation: locator('text=Active') resolved to 2 elements:
  62 |   await expect(page.locator('.todo-list li')).toHaveCount(1);
  63 |   await expect(page.locator('.todo-list li')).toHaveText('Active task');
  64 | 
  65 |   // click "Completed" filter
  66 |   await page.locator('text=Completed').click();
  67 |   await expect(page.locator('.todo-list li')).toHaveCount(1);
  68 |   await expect(page.locator('.todo-list li')).toHaveText('Done task');
  69 | 
  70 |   // click "All" filter
  71 |   await page.locator('text=All').click();
  72 |   await expect(page.locator('.todo-list li')).toHaveCount(2);
  73 | });
  74 | 
```