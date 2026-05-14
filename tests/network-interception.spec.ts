import { test, expect } from '@playwright/test';

// Reset server state before each test so API mutations don't leak between files
test.beforeEach(async ({ request }) => {
  await request.post('/api/tracks/reset');
});

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK INTERCEPTION
// Uses page.route() to intercept, block, and modify network requests in order
// to test how the app handles degraded or unexpected network conditions.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Network interception', () => {
  test('app loads successfully when CSS is blocked (graceful degradation)', async ({ page }) => {
    // Block the stylesheet and verify the app still renders its content
    await page.route('**/styles.css', (route) => route.abort());
    await page.goto('/');

    // The page should still have the correct title and functional content
    await expect(page).toHaveTitle('MixDeck — DJ Mix Player');
    await expect(page.getByRole('heading', { level: 1, name: 'MixDeck' })).toBeVisible();
    await expect(page.getByRole('listitem').first()).toBeVisible();
  });

  test('intercepted response can modify the page title', async ({ page }) => {
    // Intercept the HTML response and inject a modified <title>
    await page.route('/', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      const modified = body.replace('MixDeck — DJ Mix Player', 'Modified Title');
      await route.fulfill({ body: modified, headers: response.headers() });
    });

    await page.goto('/');
    await expect(page).toHaveTitle('Modified Title');
  });

  test('app still renders tracks when served with a slow connection', async ({ page }) => {
    // Simulate a 2-second network delay on the main script
    await page.route('**/app.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    await page.goto('/', { timeout: 15000 });

    // Tracks should still appear after the delay
    await expect(page.getByRole('listitem')).toHaveCount(6);
  });

  test('all expected static assets are requested on page load', async ({ page }) => {
    const requestedUrls: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      requestedUrls.push(url.pathname);
    });

    await page.goto('/');
    await expect(page.getByRole('listitem')).toHaveCount(6);

    // The page should request the HTML, CSS, and JS
    expect(requestedUrls).toContain('/');
    expect(requestedUrls).toContain('/styles.css');
    expect(requestedUrls).toContain('/app.js');
  });

  test('no external network requests are made (app is self-contained)', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.hostname !== 'localhost') {
        externalRequests.push(req.url());
      }
    });

    await page.goto('/');
    await expect(page.getByRole('listitem')).toHaveCount(6);

    expect(externalRequests).toHaveLength(0);
  });

  test('blocking app.js prevents tracklist from rendering', async ({ page }) => {
    await page.route('**/app.js', (route) => route.abort());
    await page.goto('/');

    // Without the script, the tracklist stays empty (populated by JS)
    await expect(page.getByRole('listitem')).toHaveCount(0);
  });

  test('response headers include correct content types', async ({ page }) => {
    const contentTypes: Record<string, string> = {};

    page.on('response', (res) => {
      const url = new URL(res.url());
      const ct = res.headers()['content-type'] || '';
      if (url.pathname === '/styles.css') contentTypes['css'] = ct;
      if (url.pathname === '/app.js') contentTypes['js'] = ct;
    });

    await page.goto('/');
    await expect(page.getByRole('listitem')).toHaveCount(6);

    expect(contentTypes['css']).toContain('css');
    expect(contentTypes['js']).toContain('javascript');
  });

  test('intercepting HTML to inject an extra genre button verifies DOM modification', async ({ page }) => {
    // Modify the HTML response to add an extra genre button
    await page.route('/', async (route) => {
      const response = await route.fetch();
      let body = await response.text();
      body = body.replace(
        '<button class="genre-btn" data-genre="UK Garage">Garage</button>',
        '<button class="genre-btn" data-genre="UK Garage">Garage</button>\n' +
        '          <button class="genre-btn" data-genre="Ambient">Ambient</button>'
      );
      await route.fulfill({ body, headers: response.headers() });
    });

    await page.goto('/');

    // The injected "Ambient" button should be visible
    await expect(page.getByRole('button', { name: 'Ambient' })).toBeVisible();
  });

  test('tracklist is empty when /api/tracks returns 500', async ({ page }) => {
    // Intercept the API call and return a server error
    await page.route('**/api/tracks', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Internal server error' }) })
    );
    await page.goto('/');

    // The tracklist should be empty — no JS errors, just no tracks rendered
    await expect(page.getByRole('listitem')).toHaveCount(0);
  });

  test('app does not throw when /api/tracks is unreachable', async ({ page }) => {
    // Block the API endpoint entirely
    await page.route('**/api/tracks', (route) => route.abort());

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    // Wait a moment for any async errors to surface
    await page.waitForTimeout(1000);

    // The tracklist is empty but there should be no uncaught exceptions
    await expect(page.getByRole('listitem')).toHaveCount(0);
    expect(errors).toHaveLength(0);
  });
});
