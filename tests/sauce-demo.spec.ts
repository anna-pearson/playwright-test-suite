import { test, expect, type Page, type Locator } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// SAUCE DEMO E2E TESTS
// Tests against saucedemo.com — a third-party e-commerce app we don't control.
// Covers login, inventory, cart, and checkout flows.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.saucedemo.com';
const VALID_USER = 'standard_user';
const VALID_PASS = 'secret_sauce';

// ── Page Object: Login ───────────────────────────────────────────────────────

class LoginPage {
  readonly page: Page;
  readonly usernameField: Locator;
  readonly passField: Locator;
  readonly loginButton: Locator;
  readonly errorMsg: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameField = page.getByPlaceholder('Username');
    this.passField = page.getByPlaceholder('Password');
    this.loginButton = page.getByRole('button', { name: 'Login' });
    this.errorMsg = page.locator('[data-test="error"]');
  }

  async goto() {
    await this.page.goto(BASE_URL);
  }

  async login(username: string, password: string) {
    await this.usernameField.fill(username);
    await this.passField.fill(password);
    await this.loginButton.click();
  }
}

// Helper: log in and land on inventory page (used by non-login tests)
async function loginAndGo(page: Page) {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(VALID_USER, VALID_PASS);
}

// ── Login ────────────────────────────────────────────────────────────────────

test.describe('Login', () => {
  test('valid credentials redirect to inventory page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(VALID_USER, VALID_PASS);
    await expect(page).toHaveURL(/inventory/);
  });

  test('locked out user sees error message', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('locked_out_user', VALID_PASS);
    await expect(loginPage.errorMsg).toBeVisible();
  });

  test('invalid password shows error message', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(VALID_USER, 'wrong password');
    await expect(loginPage.errorMsg).toBeVisible();
  });

  test('empty username shows error message', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('', VALID_PASS);
    await expect(loginPage.errorMsg).toBeVisible();
  });
});

// ── Inventory ────────────────────────────────────────────────────────────────

test.describe('Inventory', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndGo(page);
  });

  test('inventory page shows 6 products', async ({ page }) => {
    // TODO: assert that there are exactly 6 inventory items on the page
    // hint: the items are inside elements with class 'inventory_item'
  });

  test('each product has a name, price, and Add to Cart button', async ({ page }) => {
    // TODO: pick the first inventory item
    // assert it has a name (non-empty text), a price, and an "Add to cart" button
  });

  test('sort by price low to high', async ({ page }) => {
    // TODO: select 'Price (low to high)' from the sort dropdown
    // get all prices, assert the first is less than or equal to the last
    // hint: prices look like '$7.99' — you'll need to strip the '$'
  });

  test('sort by name Z to A', async ({ page }) => {
    // TODO: select 'Name (Z to A)' from the sort dropdown
    // get the first product name, assert it starts with a letter later in the alphabet
    // than the last product name
  });
});

// ── Cart ─────────────────────────────────────────────────────────────────────

test.describe('Cart', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndGo(page);
  });

  test('adding an item updates the cart badge', async ({ page }) => {
    // TODO: click "Add to cart" on the first product
    // assert the cart badge shows '1'
  });

  test('added item appears in the cart page', async ({ page }) => {
    // TODO: click "Add to cart" on the first product
    // remember the product name
    // click the cart icon to go to the cart
    // assert the product name appears in the cart
  });

  test('removing an item from the cart updates the badge', async ({ page }) => {
    // TODO: add an item, then click "Remove" on it
    // assert the cart badge is no longer visible
  });
});

// ── Checkout ─────────────────────────────────────────────────────────────────

test.describe('Checkout', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndGo(page);
    // Add an item and go to cart
    await page.locator('.inventory_item').first().getByRole('button', { name: 'Add to cart' }).click();
    await page.locator('.shopping_cart_link').click();
  });

  test('checkout button navigates to info form', async ({ page }) => {
    // TODO: click the "Checkout" button
    // assert the URL contains 'checkout-step-one'
  });

  test('submitting empty checkout form shows error', async ({ page }) => {
    // TODO: click "Checkout", then click "Continue" without filling in fields
    // assert an error message appears
  });

  test('complete checkout flow shows confirmation', async ({ page }) => {
    // TODO: click "Checkout"
    // fill in first name, last name, zip code
    // click "Continue"
    // click "Finish"
    // assert you see a confirmation message like "Thank you for your order"
  });
});
