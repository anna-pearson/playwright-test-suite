# DJ Mix Player — Playwright Test Suite

A comprehensive Playwright test suite for a browser-based DJ mix player. 116 tests across 11 categories covering functionality, accessibility, keyboard navigation, and edge cases.

## The app

A single-page DJ player built with vanilla HTML/CSS/JS. Features include:

- 6-track library with genre, BPM, and key metadata
- Play/pause, next/previous, and track selection
- Volume control with mute/unmute
- Search filtering by title, artist, genre, and key
- Genre filter buttons
- Keyboard shortcuts (Space, arrow keys, M for mute)
- Waveform visualization
- Responsive layout

## Test coverage

| Category | Tests | What's covered |
|----------|-------|----------------|
| Page load & initial state | 16 | Title, track rendering, default UI state, volume |
| Tracklist content | 8 | Metadata accuracy for all 6 tracks |
| Track selection | 8 | Click, keyboard (Enter/Space), active state |
| Playback controls | 11 | Play/pause, next/prev, wrapping, auto-advance |
| Seeking | 3 | Keyboard seek, ARIA attributes |
| Volume controls | 10 | Slider, mute/unmute, persistence, visual feedback |
| Search | 12 | Title/artist/genre/key filtering, case-insensitive, empty states |
| Genre filters | 9 | Single filter, combined with search, active state |
| Keyboard shortcuts | 16 | All shortcuts, focus guards, case-insensitive |
| Accessibility | 17 | ARIA labels, roles, keyboard nav, focus management, regions |
| Edge cases | 6 | Rapid clicks, boundary conditions, viewport sizes |

## Key patterns

### Audio stubbing

The test suite replaces `HTMLAudioElement` with a controllable fake via `page.addInitScript()`. This allows tests to run in headless CI without relying on the Web Audio API or real media decoding.

```typescript
async function stubAudio(page: Page) {
  await page.addInitScript(() => {
    // Replace audio prototype methods with controllable fakes
    // Simulates play/pause, currentTime progression, ended events
  });
}
```

### Page Object Model

All locators are centralized in a `DjPlayerPage` class, keeping tests readable and maintainable:

```typescript
const player = new DjPlayerPage(page);
await player.goto();
await player.clickTrack(0);
await expect(player.trackTitle).toHaveText('Midnight Sessions');
```

### Data-driven tests

Genre filter tests use parameterized data to avoid repetition:

```typescript
const genreScenarios = [
  { label: 'Deep House', expectedTitle: 'Midnight Sessions' },
  { label: 'Techno', expectedTitle: 'Warehouse Echoes' },
  // ...
];

for (const { label, expectedTitle } of genreScenarios) {
  test(`clicking "${label}" shows only that genre`, async ({ page }) => {
    // Same test logic, different data
  });
}
```

## Running tests

```bash
# Install dependencies
npm install
npx playwright install

# Run all tests
npx playwright test

# Run with visible browser
npx playwright test --headed

# Run a specific category
npx playwright test -g "Search"
```

## CI

Tests run automatically on every push via GitHub Actions. The workflow installs dependencies, sets up Playwright browsers, starts a local dev server, and runs the full suite.

[![Playwright Tests](https://github.com/anna-pearson/playwright-test-suite/actions/workflows/tests.yml/badge.svg)](https://github.com/anna-pearson/playwright-test-suite/actions/workflows/tests.yml)

## Built with

- [Playwright](https://playwright.dev/) — Browser testing framework
- [TypeScript](https://www.typescriptlang.org/)
- [GitHub Actions](https://github.com/features/actions) — CI/CD
