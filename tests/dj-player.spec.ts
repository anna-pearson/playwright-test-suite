import { test, expect, type Page } from '@playwright/test';

// Stub audio so playback works reliably in headless mode
async function stubAudio(page: Page) {
  await page.addInitScript(() => {
    const proto = HTMLAudioElement.prototype;
    let _currentTime = 0;
    let _duration = 20;
    let _volume = 0.8;
    let _paused = true;
    let _src = '';
    let _interval: ReturnType<typeof setInterval> | null = null;

    Object.defineProperty(proto, 'currentTime', {
      get() { return _currentTime; },
      set(v) { _currentTime = v; this.dispatchEvent(new Event('timeupdate')); },
    });
    Object.defineProperty(proto, 'duration', {
      get() { return _duration; },
    });
    Object.defineProperty(proto, 'volume', {
      get() { return _volume; },
      set(v) { _volume = v; },
    });
    Object.defineProperty(proto, 'paused', {
      get() { return _paused; },
    });
    Object.defineProperty(proto, 'src', {
      get() { return _src; },
      set(v) {
        _src = v;
        _currentTime = 0;
        _duration = 20;
        setTimeout(() => this.dispatchEvent(new Event('loadedmetadata')), 10);
      },
    });

    proto.play = function () {
      _paused = false;
      // Simulate time progressing
      _interval = setInterval(() => {
        _currentTime += 0.25;
        this.dispatchEvent(new Event('timeupdate'));
        if (_currentTime >= _duration) {
          _currentTime = _duration;
          clearInterval(_interval!);
          _paused = true;
          this.dispatchEvent(new Event('ended'));
        }
      }, 250);
      return Promise.resolve();
    };

    proto.pause = function () {
      _paused = true;
      if (_interval) clearInterval(_interval);
    };
  });
}

// ── Page Load ────────────────────────────────────────────────

test.describe('Page load', () => {
  test('has correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('MixDeck — DJ Mix Player');
  });

  test('displays all 6 tracks', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('listitem')).toHaveCount(6);
  });

  test('first track shows correct details', async ({ page }) => {
    await page.goto('/');
    const track = page.getByRole('listitem').first();

    await expect(track.locator('.item-title')).toHaveText('Midnight Sessions');
    await expect(track.locator('.item-artist')).toHaveText('DJ Anna P');
    await expect(track.locator('.item-bpm')).toHaveText('122');
    await expect(track.locator('.item-genre')).toHaveText('Deep House');
    await expect(track.locator('.item-key')).toHaveText('Am');
    await expect(track.locator('.item-duration')).toHaveText('0:20');
  });

  test('shows "No track selected" by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.track-title')).toHaveText('No track selected');
    await expect(page.locator('.track-artist')).toHaveText('');
  });

  test('play button shows play icon initially', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  test('volume starts at 80%', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.volume-value')).toHaveText('80%');
  });

  test('no-results message is hidden', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.no-results')).not.toBeVisible();
  });
});

// ── Track Selection ──────────────────────────────────────────

test.describe('Track selection', () => {
  test('clicking a track loads it into now playing', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('listitem').nth(2).click();

    await expect(page.locator('.track-title')).toHaveText('Liquid Sunshine');
    await expect(page.locator('.track-artist')).toHaveText('DJ Anna P');
    await expect(page.locator('.meta-bpm')).toHaveText('174');
    await expect(page.locator('.meta-genre')).toHaveText('Drum & Bass');
    await expect(page.locator('.meta-key')).toHaveText('Fm');
  });

  test('clicking a track marks it as active in the list', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('listitem').nth(1).click();
    await expect(page.getByRole('listitem').nth(1)).toHaveClass(/active/);
  });

  test('only one track is active at a time', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('listitem').first().click();
    await page.getByRole('listitem').nth(2).click();

    await expect(page.getByRole('listitem').first()).not.toHaveClass(/active/);
    await expect(page.getByRole('listitem').nth(2)).toHaveClass(/active/);
  });

  test('pressing Enter on a track loads it', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('listitem').nth(3).focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('.track-title')).toHaveText('Cloud Nine');
  });

  test('pressing Space on a track loads it', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('listitem').nth(4).focus();
    await page.keyboard.press('Space');

    await expect(page.locator('.track-title')).toHaveText('Neon Dreams');
  });
});

// ── Playback Controls ────────────────────────────────────────

test.describe('Playback controls', () => {
  test('play button loads first track when nothing is selected', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('button', { name: 'Play' }).click();

    await expect(page.locator('.track-title')).toHaveText('Midnight Sessions');
  });

  test('play button toggles to pause icon when playing', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('clicking pause toggles back to play icon', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('button', { name: 'Play' }).click();
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  test('next track advances to the next song', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('listitem').first().click();
    await page.getByRole('button', { name: 'Next track' }).click();

    await expect(page.locator('.track-title')).toHaveText('Warehouse Echoes');
  });

  test('next track wraps from last to first', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    // Load the last track (index 5)
    await page.getByRole('listitem').last().click();
    await expect(page.locator('.track-title')).toHaveText('Bass Culture');

    await page.getByRole('button', { name: 'Next track' }).click();
    await expect(page.locator('.track-title')).toHaveText('Midnight Sessions');
  });

  test('previous track goes to the previous song', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('listitem').nth(2).click();
    // Immediately press prev (within 3 seconds so it goes to prev track)
    await page.getByRole('button', { name: 'Previous track' }).click();

    await expect(page.locator('.track-title')).toHaveText('Warehouse Echoes');
  });

  test('previous track wraps from first to last', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('listitem').first().click();
    await page.getByRole('button', { name: 'Previous track' }).click();

    await expect(page.locator('.track-title')).toHaveText('Bass Culture');
  });

  test('app gets "playing" class when playing', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('.app')).toHaveClass(/playing/);
  });

  test('app loses "playing" class when paused', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('button', { name: 'Play' }).click();
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('.app')).not.toHaveClass(/playing/);
  });
});

// ── Search ───────────────────────────────────────────────────

test.describe('Search', () => {
  test('filters tracks by title', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('searchbox', { name: 'Search tracks' }).fill('midnight');
    await expect(page.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByRole('listitem').first().locator('.item-title')).toHaveText('Midnight Sessions');
  });

  test('filters tracks by genre', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('searchbox', { name: 'Search tracks' }).fill('techno');
    await expect(page.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByRole('listitem').first().locator('.item-title')).toHaveText('Warehouse Echoes');
  });

  test('filters tracks by key', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('searchbox', { name: 'Search tracks' }).fill('Gm');
    await expect(page.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByRole('listitem').first().locator('.item-title')).toHaveText('Bass Culture');
  });

  test('search is case insensitive', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('searchbox', { name: 'Search tracks' }).fill('LIQUID');
    await expect(page.getByRole('listitem')).toHaveCount(1);
  });

  test('clearing search shows all tracks', async ({ page }) => {
    await page.goto('/');

    const search = page.getByRole('searchbox', { name: 'Search tracks' });
    await search.fill('midnight');
    await expect(page.getByRole('listitem')).toHaveCount(1);

    await search.clear();
    await expect(page.getByRole('listitem')).toHaveCount(6);
  });

  test('no matches shows "No tracks match" message', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('searchbox', { name: 'Search tracks' }).fill('xyznotfound');
    await expect(page.getByRole('listitem')).toHaveCount(0);
    await expect(page.locator('.no-results')).toBeVisible();
  });

  test('no-results hides again when search is cleared', async ({ page }) => {
    await page.goto('/');

    const search = page.getByRole('searchbox', { name: 'Search tracks' });
    await search.fill('xyznotfound');
    await expect(page.locator('.no-results')).toBeVisible();

    await search.clear();
    await expect(page.locator('.no-results')).not.toBeVisible();
  });
});

// ── Genre Filters ────────────────────────────────────────────

test.describe('Genre filters', () => {
  test('"All" button is active by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'All' })).toHaveClass(/active/);
  });

  test('clicking a genre filters the tracklist', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Techno' }).click();
    await expect(page.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByRole('listitem').first().locator('.item-title')).toHaveText('Warehouse Echoes');
  });

  test('clicking a genre makes it the active button', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'DnB' }).click();
    await expect(page.getByRole('button', { name: 'DnB' })).toHaveClass(/active/);
    await expect(page.getByRole('button', { name: 'All' })).not.toHaveClass(/active/);
  });

  test('"All" shows all tracks again', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Techno' }).click();
    await expect(page.getByRole('listitem')).toHaveCount(1);

    await page.getByRole('button', { name: 'All' }).click();
    await expect(page.getByRole('listitem')).toHaveCount(6);
  });

  test('genre filter + search combine', async ({ page }) => {
    await page.goto('/');

    // "DJ Anna P" matches all tracks, but genre filter narrows it
    await page.getByRole('button', { name: 'Progressive' }).click();
    await page.getByRole('searchbox', { name: 'Search tracks' }).fill('cloud');

    await expect(page.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByRole('listitem').first().locator('.item-title')).toHaveText('Cloud Nine');
  });

  test('genre filter with no search matches shows no-results', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Techno' }).click();
    await page.getByRole('searchbox', { name: 'Search tracks' }).fill('midnight');

    // "Midnight Sessions" is Deep House, not Techno
    await expect(page.getByRole('listitem')).toHaveCount(0);
    await expect(page.locator('.no-results')).toBeVisible();
  });
});

// ── Volume Controls ──────────────────────────────────────────

test.describe('Volume controls', () => {
  test('mute button sets volume to 0%', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Mute' }).click();
    await expect(page.locator('.volume-value')).toHaveText('0%');
  });

  test('mute button label changes to "Unmute"', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Mute' }).click();
    await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible();
  });

  test('unmute restores previous volume', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Mute' }).click();
    await expect(page.locator('.volume-value')).toHaveText('0%');

    await page.getByRole('button', { name: 'Unmute' }).click();
    await expect(page.locator('.volume-value')).toHaveText('80%');
  });

  test('volume slider updates the display', async ({ page }) => {
    await page.goto('/');

    await page.locator('.volume-slider').fill('50');
    await expect(page.locator('.volume-value')).toHaveText('50%');
  });

  test('setting slider to 0 shows mute icon', async ({ page }) => {
    await page.goto('/');

    await page.locator('.volume-slider').fill('0');
    await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible();
  });
});

// ── Keyboard Shortcuts ───────────────────────────────────────

test.describe('Keyboard shortcuts', () => {
  test('Space toggles play', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.keyboard.press('Space');
    await expect(page.locator('.track-title')).toHaveText('Midnight Sessions');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('Space does not toggle play when search is focused', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('searchbox', { name: 'Search tracks' }).focus();
    await page.keyboard.press('Space');

    // Should NOT have started playing
    await expect(page.locator('.track-title')).toHaveText('No track selected');
  });

  test('Shift+Right goes to next track', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('listitem').first().click();
    await expect(page.locator('.track-title')).toHaveText('Midnight Sessions');

    await page.keyboard.press('Shift+ArrowRight');
    await expect(page.locator('.track-title')).toHaveText('Warehouse Echoes');
  });

  test('Shift+Left goes to previous track', async ({ page }) => {
    await stubAudio(page);
    await page.goto('/');

    await page.getByRole('listitem').nth(2).click();
    await page.keyboard.press('Shift+ArrowLeft');

    await expect(page.locator('.track-title')).toHaveText('Warehouse Echoes');
  });

  test('ArrowUp increases volume', async ({ page }) => {
    await page.goto('/');

    // Volume starts at 80%
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.volume-value')).toHaveText('85%');
  });

  test('ArrowDown decreases volume', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.volume-value')).toHaveText('75%');
  });

  test('M key toggles mute', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('m');
    await expect(page.locator('.volume-value')).toHaveText('0%');

    await page.keyboard.press('m');
    await expect(page.locator('.volume-value')).toHaveText('80%');
  });

  test('volume caps at 100%', async ({ page }) => {
    await page.goto('/');

    // 80 + 5*5 = 105, should cap at 100
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowUp');
    }
    await expect(page.locator('.volume-value')).toHaveText('100%');
  });

  test('volume caps at 0%', async ({ page }) => {
    await page.goto('/');

    // 80 - 5*17 = -5, should cap at 0
    for (let i = 0; i < 17; i++) {
      await page.keyboard.press('ArrowDown');
    }
    await expect(page.locator('.volume-value')).toHaveText('0%');
  });
});

// ── Accessibility ────────────────────────────────────────────

test.describe('Accessibility', () => {
  test('tracks are focusable via keyboard', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('listitem').first().focus();
    await expect(page.getByRole('listitem').first()).toBeFocused();
  });

  test('genre filter group has accessible label', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Filter by genre' })).toBeVisible();
  });

  test('progress bar has slider role', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('slider', { name: 'Seek' })).toBeVisible();
  });

  test('volume slider has accessible label', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('slider', { name: 'Volume' })).toBeVisible();
  });

  test('now playing section has accessible label', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('section[aria-label="Now playing"]')).toBeVisible();
  });

  test('playback controls section has accessible label', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('section[aria-label="Playback controls"]')).toBeVisible();
  });
});
