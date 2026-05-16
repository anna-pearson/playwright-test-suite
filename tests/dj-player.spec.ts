import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Reset server state before each test so API mutations don't leak between files
test.beforeEach(async ({ request }) => {
  await request.post('/api/tracks/reset');
});

// ─────────────────────────────────────────────────────────────────────────────
// Audio stub
// Replaces HTMLAudioElement with a controllable fake so tests run headlessly
// without relying on the Web Audio API or real media decoding.
// ─────────────────────────────────────────────────────────────────────────────
async function stubAudio(page: Page) {
  await page.addInitScript(() => {
    const proto = HTMLAudioElement.prototype;
    let _currentTime = 0;
    let _duration = 20;
    let _volume = 0.8;
    let _paused = true;
    let _src = '';
    let _interval: ReturnType<typeof setInterval> | null = null;
    // Keep a reference to the last constructed audio instance for test access
    let _lastInstance: HTMLAudioElement | null = null;

    Object.defineProperty(proto, 'currentTime', {
      get() { return _currentTime; },
      set(v) {
        _currentTime = v;
        this.dispatchEvent(new Event('timeupdate'));
      },
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
        _lastInstance = this as unknown as HTMLAudioElement;
        (window as any).__stubAudioInstance = _lastInstance;
        setTimeout(() => this.dispatchEvent(new Event('loadedmetadata')), 10);
      },
    });

    proto.play = function () {
      _paused = false;
      _lastInstance = this as unknown as HTMLAudioElement;
      (window as any).__stubAudioInstance = _lastInstance;
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

// ─────────────────────────────────────────────────────────────────────────────
// Page Object
// Centralises locators so every test can refer to them by name instead of
// repeating selector strings throughout the file.
// ─────────────────────────────────────────────────────────────────────────────
class DjPlayerPage {
  constructor(private readonly page: Page) {}

  // ── Navigation ──────────────────────────────────────────────────────────
  async goto() {
    await this.page.goto('/');
    await this.page.getByRole('listitem').first().waitFor();
  }

  // ── Now-playing panel ───────────────────────────────────────────────────
  get nowPlayingSection() {
    return this.page.locator('section[aria-label="Now playing"]');
  }
  get trackTitle() { return this.page.locator('.track-title'); }
  get trackArtist() { return this.page.locator('.track-artist'); }
  get metaBpm()    { return this.page.locator('.meta-bpm'); }
  get metaGenre()  { return this.page.locator('.meta-genre'); }
  get metaKey()    { return this.page.locator('.meta-key'); }
  get waveform()   { return this.page.locator('canvas.waveform'); }

  // ── Transport ────────────────────────────────────────────────────────────
  get transportSection() {
    return this.page.locator('section[aria-label="Playback controls"]');
  }
  // Use exact: true so "Unmute" does not accidentally match "Mute"
  get btnPlay()    { return this.page.getByRole('button', { name: 'Play', exact: true }); }
  get btnPause()   { return this.page.getByRole('button', { name: 'Pause', exact: true }); }
  get btnNext()    { return this.page.getByRole('button', { name: 'Next track' }); }
  get btnPrev()    { return this.page.getByRole('button', { name: 'Previous track' }); }
  get seekSlider() { return this.page.getByRole('slider', { name: 'Seek' }); }
  get timeCurrent(){ return this.page.locator('.time-current'); }
  get timeDuration(){ return this.page.locator('.time-duration'); }
  get progressFill(){ return this.page.locator('.progress-fill'); }

  // ── Volume ───────────────────────────────────────────────────────────────
  // exact: true prevents "Mute" from matching "Unmute" (substring issue)
  get btnMute()      { return this.page.getByRole('button', { name: 'Mute', exact: true }); }
  get btnUnmute()    { return this.page.getByRole('button', { name: 'Unmute', exact: true }); }
  get volumeSlider() { return this.page.getByRole('slider', { name: 'Volume' }); }
  get volumeValue()  { return this.page.locator('.volume-value'); }

  // ── Library ──────────────────────────────────────────────────────────────
  get librarySection() {
    return this.page.locator('section[aria-label="Track library"]');
  }
  get searchInput() {
    return this.page.getByRole('searchbox', { name: 'Search tracks' });
  }
  get genreGroup() {
    return this.page.getByRole('group', { name: 'Filter by genre' });
  }
  get trackItems() { return this.page.getByRole('listitem'); }
  get noResults()  { return this.page.locator('.no-results'); }
  get appRoot()    { return this.page.locator('.app'); }

  // ── Helpers ──────────────────────────────────────────────────────────────
  trackItem(index: number)   { return this.trackItems.nth(index); }
  genreBtn(name: string)     { return this.page.getByRole('button', { name }); }

  async clickTrack(index: number) {
    await this.trackItem(index).click();
  }

  async startPlayback() {
    await this.btnPlay.click();
  }

  /** Fire the 'ended' event on the currently active stubbed audio instance */
  async fireEnded() {
    await this.page.evaluate(() => {
      const inst = (window as any).__stubAudioInstance as HTMLAudioElement | undefined;
      if (inst) {
        inst.dispatchEvent(new Event('ended'));
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · PAGE LOAD & INITIAL STATE
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page load & initial state', () => {
  test('page has the correct title', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(page).toHaveTitle('MixDeck — DJ Mix Player');
  });

  test('header shows the MixDeck logo and tagline', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(page.getByRole('heading', { level: 1, name: 'MixDeck' })).toBeVisible();
    await expect(page.getByText('DJ Mix Player')).toBeVisible();
  });

  test('defaults to "No track selected"', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.trackTitle).toHaveText('No track selected');
    await expect(player.trackArtist).toHaveText('');
  });

  test('BPM, genre and key meta fields are empty on load', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.metaBpm).toHaveText('');
    await expect(player.metaGenre).toHaveText('');
    await expect(player.metaKey).toHaveText('');
  });

  test('progress bar starts at 0:00 / 0:00', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.timeCurrent).toHaveText('0:00');
    await expect(player.timeDuration).toHaveText('0:00');
  });

  test('play button is visible and labelled "Play" initially', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.btnPlay).toBeVisible();
  });

  test('pause icon is hidden initially', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(page.locator('.icon-pause')).not.toBeVisible();
  });

  test('volume slider defaults to 80', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.volumeSlider).toHaveValue('80');
    await expect(player.volumeValue).toHaveText('80%');
  });

  test('mute button is visible and labelled "Mute"', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.btnMute).toBeVisible();
  });

  test('all six tracks are rendered in the tracklist', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.trackItems).toHaveCount(6);
  });

  test('"No results" message is hidden on load', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.noResults).not.toBeVisible();
  });

  test('"All" genre filter is active by default', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.genreBtn('All')).toHaveClass(/active/);
  });

  test('waveform canvas is present', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.waveform).toBeVisible();
  });

  test('app root does NOT have the "playing" class initially', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.appRoot).not.toHaveClass(/playing/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · TRACKLIST — CONTENT & STRUCTURE
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Tracklist — content & structure', () => {
  const expectedTracks = [
    { title: 'Midnight Sessions', artist: 'DJ Anna P', bpm: '122', genre: 'Deep House',        key: 'Am', duration: '0:20' },
    { title: 'Warehouse Echoes',  artist: 'DJ Anna P', bpm: '138', genre: 'Techno',             key: 'Dm', duration: '0:25' },
    { title: 'Liquid Sunshine',   artist: 'DJ Anna P', bpm: '174', genre: 'Drum & Bass',        key: 'Fm', duration: '0:15' },
    { title: 'Cloud Nine',        artist: 'DJ Anna P', bpm: '128', genre: 'Progressive House',  key: 'Cm', duration: '0:30' },
    { title: 'Neon Dreams',       artist: 'DJ Anna P', bpm: '110', genre: 'Synthwave',          key: 'Em', duration: '0:20' },
    { title: 'Bass Culture',      artist: 'DJ Anna P', bpm: '130', genre: 'UK Garage',          key: 'Gm', duration: '0:18' },
  ];

  for (const [i, track] of expectedTracks.entries()) {
    test(`track ${i + 1} — "${track.title}" shows correct metadata`, async ({ page }) => {
      const player = new DjPlayerPage(page);
      await player.goto();
      const item = player.trackItem(i);
      await expect(item.locator('.item-title')).toHaveText(track.title);
      await expect(item.locator('.item-artist')).toHaveText(track.artist);
      await expect(item.locator('.item-bpm')).toHaveText(track.bpm);
      await expect(item.locator('.item-genre')).toHaveText(track.genre);
      await expect(item.locator('.item-key')).toHaveText(track.key);
      await expect(item.locator('.item-duration')).toHaveText(track.duration);
    });
  }

  test('tracklist header shows all column labels', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    const header = page.locator('.tracklist-header');
    await expect(header.locator('.col-title')).toHaveText('Title');
    await expect(header.locator('.col-bpm')).toHaveText('BPM');
    await expect(header.locator('.col-genre')).toHaveText('Genre');
    await expect(header.locator('.col-key')).toHaveText('Key');
    await expect(header.locator('.col-duration')).toHaveText('Duration');
  });

  test('each track item has a tabindex so it is keyboard reachable', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    const items = player.trackItems;
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      await expect(items.nth(i)).toHaveAttribute('tabindex', '0');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · TRACK SELECTION
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Track selection', () => {
  test('clicking a track loads it into the "Now Playing" panel', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(0);

    await expect(player.trackTitle).toHaveText('Midnight Sessions');
    await expect(player.trackArtist).toHaveText('DJ Anna P');
    await expect(player.metaBpm).toHaveText('122');
    await expect(player.metaGenre).toHaveText('Deep House');
    await expect(player.metaKey).toHaveText('Am');
  });

  test('clicking the third track loads its details', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(2);

    await expect(player.trackTitle).toHaveText('Liquid Sunshine');
    await expect(player.metaBpm).toHaveText('174');
    await expect(player.metaGenre).toHaveText('Drum & Bass');
    await expect(player.metaKey).toHaveText('Fm');
  });

  test('clicking a track marks it as "active" in the list', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(1);
    await expect(player.trackItem(1)).toHaveClass(/active/);
  });

  test('previously active track loses the "active" class', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(0);
    await player.clickTrack(3);

    await expect(player.trackItem(0)).not.toHaveClass(/active/);
    await expect(player.trackItem(3)).toHaveClass(/active/);
  });

  test('only one track is active at a time', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(0);
    await player.clickTrack(4);

    const activeItems = page.locator('.tracklist-item.active');
    await expect(activeItems).toHaveCount(1);
  });

  test('pressing Enter on a focused track loads it', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.trackItem(3).focus();
    await page.keyboard.press('Enter');

    await expect(player.trackTitle).toHaveText('Cloud Nine');
  });

  test('pressing Space on a focused track loads it', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.trackItem(4).focus();
    await page.keyboard.press('Space');

    await expect(player.trackTitle).toHaveText('Neon Dreams');
  });

  test('clicking a track starts playback automatically', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(0);

    await expect(player.btnPause).toBeVisible();
    await expect(player.appRoot).toHaveClass(/playing/);
  });

  test('track duration appears in the transport bar after loading', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(0); // duration 20 s
    await expect(player.timeDuration).toHaveText('0:20');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · PLAYBACK CONTROLS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Playback controls', () => {
  test('pressing Play with no track loads and plays the first track', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.startPlayback();

    await expect(player.trackTitle).toHaveText('Midnight Sessions');
    await expect(player.btnPause).toBeVisible();
  });

  test('play icon hides and pause icon appears when playing', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.startPlayback();

    await expect(page.locator('.icon-play')).not.toBeVisible();
    await expect(page.locator('.icon-pause')).toBeVisible();
  });

  test('pause icon hides and play icon returns after pausing', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.startPlayback();
    await player.btnPause.click();

    await expect(page.locator('.icon-play')).toBeVisible();
    await expect(page.locator('.icon-pause')).not.toBeVisible();
  });

  test('app gains "playing" class on play', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.startPlayback();

    await expect(player.appRoot).toHaveClass(/playing/);
  });

  test('app loses "playing" class on pause', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.startPlayback();
    await player.btnPause.click();

    await expect(player.appRoot).not.toHaveClass(/playing/);
  });

  test('Next track advances to the second track', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(0);
    await player.btnNext.click();

    await expect(player.trackTitle).toHaveText('Warehouse Echoes');
  });

  test('Next track wraps around from the last track to the first', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(5); // Bass Culture (last)
    await player.btnNext.click();

    await expect(player.trackTitle).toHaveText('Midnight Sessions');
  });

  test('Previous track goes back one track', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(2);
    await player.btnPrev.click();

    await expect(player.trackTitle).toHaveText('Warehouse Echoes');
  });

  test('Previous track wraps from the first track to the last', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(0);
    // Ensure currentTime is under 3s so Prev goes to previous track, not restart
    await page.evaluate(() => {
      const audio = document.querySelector('audio') as HTMLAudioElement | null;
      if (audio) audio.currentTime = 0;
    });
    await player.btnPrev.click();

    await expect(player.trackTitle).toHaveText('Bass Culture');
  });

  test('track progresses: current time advances while playing', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.startPlayback();

    // Wait for simulated time to tick at least once
    await expect(player.timeCurrent).not.toHaveText('0:00', { timeout: 3000 });
  });

  test('progress bar fill width increases while playing', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.startPlayback();

    await expect(async () => {
      const width = await player.progressFill.evaluate((el) =>
        parseFloat((el as HTMLElement).style.width));
      expect(width).toBeGreaterThan(0);
    }).toPass({ timeout: 3000 });
  });

  test('track auto-advances to next when it ends', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    // Load the first track and start playback so the stub instance is set
    await player.clickTrack(0);

    // Fire the 'ended' event on the stubbed audio instance via the exposed reference
    await player.fireEnded();

    // After ended fires, the player's onTrackEnd → nextTrack() loads track 2
    await expect(player.trackTitle).toHaveText('Warehouse Echoes', { timeout: 3000 });
  });

  test('seek slider aria-valuenow updates as track plays', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.startPlayback();

    await expect(async () => {
      const val = await player.seekSlider.getAttribute('aria-valuenow');
      expect(Number(val)).toBeGreaterThan(0);
    }).toPass({ timeout: 3000 });
  });

  test('clicking Next while paused still advances the track', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(1);
    await player.btnPause.click();
    await player.btnNext.click();

    await expect(player.trackTitle).toHaveText('Liquid Sunshine');
  });

  test('Previous restarts the current track if playback is past 3 seconds', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(2); // Liquid Sunshine
    // Seek past the 3-second threshold using the stub instance
    await page.evaluate(() => {
      (window as any).__stubAudioInstance.currentTime = 5;
    });
    await player.btnPrev.click();

    // Track should stay the same (restart, not go to previous)
    await expect(player.trackTitle).toHaveText('Liquid Sunshine');
    await expect(player.timeCurrent).toHaveText('0:00');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · SEEKING
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Seeking', () => {
  test('ArrowRight seeks forward by 5 seconds', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(0);
    // Snapshot time just before seeking
    const before = await page.evaluate(() => (window as any).__stubAudioInstance.currentTime);
    await page.keyboard.press('ArrowRight');
    const after = await page.evaluate(() => (window as any).__stubAudioInstance.currentTime);

    // ArrowRight adds 5s — allow small slack for the stub's interval
    expect(after - before).toBeGreaterThanOrEqual(4.5);
    expect(after - before).toBeLessThanOrEqual(6);
  });

  test('ArrowLeft seeks backward by 5 seconds', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(0);
    // Seek forward twice first so we have room to go back
    await page.keyboard.press('ArrowRight'); // +5
    await page.keyboard.press('ArrowRight'); // +5
    const before = await page.evaluate(() => (window as any).__stubAudioInstance.currentTime);
    await page.keyboard.press('ArrowLeft');  // -5
    const after = await page.evaluate(() => (window as any).__stubAudioInstance.currentTime);

    expect(before - after).toBeGreaterThanOrEqual(4.5);
    expect(before - after).toBeLessThanOrEqual(6);
  });

  test('seek slider has correct aria attributes', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await expect(player.seekSlider).toHaveAttribute('aria-valuemin', '0');
    await expect(player.seekSlider).toHaveAttribute('aria-valuemax', '100');
    await expect(player.seekSlider).toHaveAttribute('aria-valuenow', '0');
  });

  test('clicking the progress bar seeks to that position', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(0);
    // Click the middle of the progress bar to seek to ~50%
    const progressTrack = page.locator('.progress-track');
    const box = await progressTrack.boundingBox();
    if (!box) throw new Error('Progress bar not found');

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    // Time should be roughly half the track duration (20s → ~10s)
    await expect(player.timeCurrent).not.toHaveText('0:00');
    const time = await player.timeCurrent.textContent();
    const [min, sec] = time!.split(':').map(Number);
    const totalSec = min * 60 + sec;
    expect(totalSec).toBeGreaterThanOrEqual(8);
    expect(totalSec).toBeLessThanOrEqual(12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6 · VOLUME CONTROLS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Volume controls', () => {
  test('dragging the volume slider to 50 shows "50%"', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.volumeSlider.fill('50');
    await expect(player.volumeValue).toHaveText('50%');
  });

  test('dragging the volume slider to 0 shows "0%"', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.volumeSlider.fill('0');
    await expect(player.volumeValue).toHaveText('0%');
  });

  test('dragging the volume slider to 100 shows "100%"', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.volumeSlider.fill('100');
    await expect(player.volumeValue).toHaveText('100%');
  });

  test('Mute button sets volume display to 0%', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.btnMute.click();
    await expect(player.volumeValue).toHaveText('0%');
    await expect(player.volumeSlider).toHaveValue('0');
  });

  test('Mute button label changes to "Unmute" after clicking', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    // The mute button's aria-label changes from "Mute" to "Unmute" on the
    // same DOM element. We verify by checking the aria-label attribute directly.
    await player.btnMute.click();
    await expect(page.locator('.btn-mute')).toHaveAttribute('aria-label', 'Unmute');
  });

  test('mute icon switches to muted icon', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.btnMute.click();
    await expect(page.locator('.icon-vol-on')).not.toBeVisible();
    await expect(page.locator('.icon-vol-off')).toBeVisible();
  });

  test('Unmute restores the previous volume level', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.btnMute.click();
    // After muting, the same btn-mute element now has aria-label="Unmute"
    // so btnUnmute (exact match) finds it correctly
    await player.btnUnmute.click();

    await expect(player.volumeValue).toHaveText('80%');
    await expect(player.volumeSlider).toHaveValue('80');
  });

  test('unmuting restores the volume icon to the "on" state', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.btnMute.click();
    await player.btnUnmute.click();

    await expect(page.locator('.icon-vol-on')).toBeVisible();
    await expect(page.locator('.icon-vol-off')).not.toBeVisible();
  });

  test('setting slider to 0 changes mute button label to "Unmute"', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.volumeSlider.fill('0');
    await expect(page.locator('.btn-mute')).toHaveAttribute('aria-label', 'Unmute');
  });

  test('raising slider above 0 after muting changes label back to "Mute"', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.volumeSlider.fill('0');
    await player.volumeSlider.fill('60');
    await expect(page.locator('.btn-mute')).toHaveAttribute('aria-label', 'Mute');
  });

  test('mute then unmute preserves a custom volume level', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.volumeSlider.fill('40');
    await player.btnMute.click();
    await player.btnUnmute.click();

    await expect(player.volumeValue).toHaveText('40%');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 · SEARCH
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Search', () => {
  test('search box has the correct placeholder text', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.searchInput).toHaveAttribute('placeholder', 'Search mixes...');
  });

  test('typing filters the tracklist by title', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.searchInput.fill('midnight');
    await expect(player.trackItems).toHaveCount(1);
    await expect(player.trackItem(0).locator('.item-title')).toHaveText('Midnight Sessions');
  });

  test('typing filters by artist name', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    // All tracks share the same artist – should return all 6
    await player.searchInput.fill('DJ Anna');
    await expect(player.trackItems).toHaveCount(6);
  });

  test('typing filters by genre', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.searchInput.fill('techno');
    await expect(player.trackItems).toHaveCount(1);
    await expect(player.trackItem(0).locator('.item-title')).toHaveText('Warehouse Echoes');
  });

  test('typing filters by musical key', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.searchInput.fill('Gm');
    await expect(player.trackItems).toHaveCount(1);
    await expect(player.trackItem(0).locator('.item-title')).toHaveText('Bass Culture');
  });

  test('search is case-insensitive', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.searchInput.fill('LIQUID SUNSHINE');
    await expect(player.trackItems).toHaveCount(1);
  });

  test('partial title match works', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.searchInput.fill('neon');
    await expect(player.trackItems).toHaveCount(1);
    await expect(player.trackItem(0).locator('.item-title')).toHaveText('Neon Dreams');
  });

  test('clearing the search shows all 6 tracks again', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    // "synthwave" uniquely matches only Neon Dreams (1 result)
    await player.searchInput.fill('synthwave');
    await expect(player.trackItems).toHaveCount(1);

    await player.searchInput.clear();
    await expect(player.trackItems).toHaveCount(6);
  });

  test('a query that matches nothing shows the "No tracks" message', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.searchInput.fill('xyzxyzxyz');
    await expect(player.trackItems).toHaveCount(0);
    await expect(player.noResults).toBeVisible();
    await expect(player.noResults).toHaveText('No tracks match your search.');
  });

  test('"No tracks" message disappears after clearing the query', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.searchInput.fill('xyzxyzxyz');
    await expect(player.noResults).toBeVisible();

    await player.searchInput.clear();
    await expect(player.noResults).not.toBeVisible();
  });

  test('single-character query shows matching tracks', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    // 'Fm' key — searching 'f' should match Liquid Sunshine's key
    await player.searchInput.fill('f');
    // At minimum Liquid Sunshine (key Fm) and Drum & Bass (contains 'f') match
    const count = await player.trackItems.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('"bass culture" uniquely matches the UK Garage track', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    // Use full title to ensure a unique match — "bass" alone also hits "Drum & Bass"
    await player.searchInput.fill('bass culture');
    await expect(player.trackItems).toHaveCount(1);
    await expect(player.trackItem(0).locator('.item-title')).toHaveText('Bass Culture');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8 · GENRE FILTERS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Genre filters', () => {
  const genreScenarios: Array<{ label: string; genre: string; expectedTitle: string }> = [
    { label: 'Deep House',        genre: 'Deep House',       expectedTitle: 'Midnight Sessions' },
    { label: 'Techno',            genre: 'Techno',           expectedTitle: 'Warehouse Echoes'  },
    { label: 'DnB',               genre: 'Drum & Bass',      expectedTitle: 'Liquid Sunshine'   },
    { label: 'Progressive',       genre: 'Progressive House',expectedTitle: 'Cloud Nine'        },
    { label: 'Synthwave',         genre: 'Synthwave',        expectedTitle: 'Neon Dreams'       },
    { label: 'Garage',            genre: 'UK Garage',        expectedTitle: 'Bass Culture'      },
  ];

  for (const { label, expectedTitle } of genreScenarios) {
    test(`clicking "${label}" shows only that genre's track`, async ({ page }) => {
      const player = new DjPlayerPage(page);
      await player.goto();

      await player.genreBtn(label).click();
      await expect(player.trackItems).toHaveCount(1);
      await expect(player.trackItem(0).locator('.item-title')).toHaveText(expectedTitle);
    });
  }

  test('clicking a genre marks it as "active"', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.genreBtn('Techno').click();
    await expect(player.genreBtn('Techno')).toHaveClass(/active/);
    await expect(player.genreBtn('All')).not.toHaveClass(/active/);
  });

  test('only one genre button is active at a time', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.genreBtn('Techno').click();
    await player.genreBtn('Synthwave').click();

    await expect(player.genreBtn('Techno')).not.toHaveClass(/active/);
    await expect(player.genreBtn('Synthwave')).toHaveClass(/active/);
  });

  test('clicking "All" after a filter restores all 6 tracks', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.genreBtn('Techno').click();
    await expect(player.trackItems).toHaveCount(1);

    await player.genreBtn('All').click();
    await expect(player.trackItems).toHaveCount(6);
    await expect(player.genreBtn('All')).toHaveClass(/active/);
  });

  test('genre filter combines with search — both must match', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.genreBtn('Progressive').click();
    await player.searchInput.fill('cloud');

    await expect(player.trackItems).toHaveCount(1);
    await expect(player.trackItem(0).locator('.item-title')).toHaveText('Cloud Nine');
  });

  test('genre filter + mismatching search shows "No tracks" message', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.genreBtn('Techno').click();
    await player.searchInput.fill('midnight'); // Midnight Sessions is Deep House

    await expect(player.trackItems).toHaveCount(0);
    await expect(player.noResults).toBeVisible();
  });

  test('clearing search after a combined filter reverts to genre-only result', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.genreBtn('Techno').click();
    await player.searchInput.fill('midnight');
    await expect(player.trackItems).toHaveCount(0);

    await player.searchInput.clear();
    // Techno filter still active → only Warehouse Echoes
    await expect(player.trackItems).toHaveCount(1);
    await expect(player.noResults).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9 · KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Keyboard shortcuts', () => {
  test('Space plays the first track when nothing is selected', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await page.keyboard.press('Space');

    await expect(player.trackTitle).toHaveText('Midnight Sessions');
    await expect(player.btnPause).toBeVisible();
  });

  test('Space pauses a playing track', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.startPlayback();
    await page.keyboard.press('Space');

    await expect(player.btnPlay).toBeVisible();
    await expect(player.appRoot).not.toHaveClass(/playing/);
  });

  test('Space does NOT toggle playback when search input is focused', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.searchInput.focus();
    await page.keyboard.press('Space');

    // Search box should receive the space character; player must stay idle
    await expect(player.trackTitle).toHaveText('No track selected');
  });

  test('Shift+ArrowRight skips to the next track', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(0);
    await page.keyboard.press('Shift+ArrowRight');

    await expect(player.trackTitle).toHaveText('Warehouse Echoes');
  });

  test('Shift+ArrowLeft skips to the previous track', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(2);
    await page.keyboard.press('Shift+ArrowLeft');

    await expect(player.trackTitle).toHaveText('Warehouse Echoes');
  });

  test('ArrowUp increases volume by 5%', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await page.keyboard.press('ArrowUp');
    await expect(player.volumeValue).toHaveText('85%');
  });

  test('ArrowDown decreases volume by 5%', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await page.keyboard.press('ArrowDown');
    await expect(player.volumeValue).toHaveText('75%');
  });

  test('ArrowUp caps volume at 100%', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    // 80 → 100 needs 4 presses; press 10 to be sure
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowUp');
    await expect(player.volumeValue).toHaveText('100%');
  });

  test('ArrowDown caps volume at 0%', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    // 80 → 0 needs 16 presses; press 20 to be sure
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowDown');
    await expect(player.volumeValue).toHaveText('0%');
  });

  test('"m" key mutes', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await page.keyboard.press('m');
    await expect(player.volumeValue).toHaveText('0%');
  });

  test('"m" key unmutes and restores previous volume', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await page.keyboard.press('m');
    await page.keyboard.press('m');
    await expect(player.volumeValue).toHaveText('80%');
  });

  test('"M" (uppercase) also toggles mute', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await page.keyboard.press('M');
    await expect(player.volumeValue).toHaveText('0%');
  });

  test('ArrowUp/ArrowDown do not change volume when search input is focused', async ({ page }) => {
    // The keyboard handler bails early when e.target === searchInput,
    // so ArrowUp/Down are suppressed — volume stays unchanged.
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.searchInput.focus();
    await page.keyboard.press('ArrowUp');

    // Volume stays at 80% because the handler returned early
    await expect(player.volumeValue).toHaveText('80%');
  });

  test('Shift+ArrowRight wraps around from last to first', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(5); // Bass Culture
    await page.keyboard.press('Shift+ArrowRight');

    await expect(player.trackTitle).toHaveText('Midnight Sessions');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10 · ACCESSIBILITY
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Accessibility', () => {
  test('"Now playing" section has an accessible region label', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(page.getByRole('region', { name: 'Now playing' })).toBeVisible();
  });

  test('"Playback controls" section has an accessible region label', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(page.getByRole('region', { name: 'Playback controls' })).toBeVisible();
  });

  test('"Track library" section has an accessible region label', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(page.getByRole('region', { name: 'Track library' })).toBeVisible();
  });

  test('Genre filter group has an accessible label', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(page.getByRole('group', { name: 'Filter by genre' })).toBeVisible();
  });

  test('Seek progress bar has role="slider" and aria-label="Seek"', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.seekSlider).toBeVisible();
  });

  test('Volume slider has aria-label="Volume"', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.volumeSlider).toBeVisible();
  });

  test('Play button has an accessible name', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.btnPlay).toHaveAttribute('aria-label', 'Play');
  });

  test('Pause button aria-label updates to "Pause" when playing', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.startPlayback();
    await expect(page.locator('.btn-play')).toHaveAttribute('aria-label', 'Pause');
  });

  test('Mute button aria-label updates to "Unmute" when muted', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.btnMute.click();
    await expect(page.locator('.btn-mute')).toHaveAttribute('aria-label', 'Unmute');
  });

  test('Previous track button has an accessible name', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.btnPrev).toHaveAttribute('aria-label', 'Previous track');
  });

  test('Next track button has an accessible name', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.btnNext).toHaveAttribute('aria-label', 'Next track');
  });

  test('Waveform canvas has an accessible aria-label', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.waveform).toHaveAttribute('aria-label', 'Audio waveform visualization');
  });

  test('Search input has an accessible label', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.searchInput).toHaveAttribute('aria-label', 'Search tracks');
  });

  test('Track items are keyboard focusable', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.trackItem(0).focus();
    await expect(player.trackItem(0)).toBeFocused();
  });

  test('seek slider aria-valuemin is 0', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.seekSlider).toHaveAttribute('aria-valuemin', '0');
  });

  test('seek slider aria-valuemax is 100', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(player.seekSlider).toHaveAttribute('aria-valuemax', '100');
  });

  test('page language is set to English', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('axe scan: page has no critical accessibility violations', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(v => v.impact === 'critical')).toHaveLength(0);
  });

  test('axe scan: page has no serious accessibility violations', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(v => v.impact === 'serious')).toHaveLength(0);
  });

  test('axe scan: full WCAG 2.1 AA compliance check', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(results.violations).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11 · EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edge cases', () => {
  test('clicking Next with no track loaded plays the first track', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    // currentTrackIndex starts at -1; (−1 + 1) % 6 = 0 → first track
    await player.btnNext.click();
    await expect(player.trackTitle).toHaveText('Midnight Sessions');
  });

  test('clicking the same track twice keeps it active', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(2);
    await player.clickTrack(2);

    await expect(player.trackTitle).toHaveText('Liquid Sunshine');
    await expect(player.trackItem(2)).toHaveClass(/active/);
  });

  test('volume slider min boundary: cannot go below 0', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.volumeSlider.fill('0');
    const value = await player.volumeSlider.inputValue();
    expect(Number(value)).toBeGreaterThanOrEqual(0);
    await expect(player.volumeValue).toHaveText('0%');
  });

  test('volume slider max boundary: cannot exceed 100', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.volumeSlider.fill('100');
    const value = await player.volumeSlider.inputValue();
    expect(Number(value)).toBeLessThanOrEqual(100);
    await expect(player.volumeValue).toHaveText('100%');
  });

  test('search with only whitespace shows no tracks (whitespace is not trimmed)', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    // The app does not trim search input — "   " is truthy so it tries to
    // match, but no track title/artist/genre/key contains only spaces → 0 results
    await player.searchInput.fill('   ');
    await expect(player.trackItems).toHaveCount(0);
  });

  test('rapidly switching genre filters does not crash the app', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    const genres = ['Techno', 'DnB', 'Progressive', 'Synthwave', 'All'];
    for (const g of genres) await player.genreBtn(g).click();

    await expect(player.trackItems).toHaveCount(6);
  });

  test('loading tracks in quick succession shows only the last one', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    // Click multiple tracks rapidly
    await player.clickTrack(0);
    await player.clickTrack(1);
    await player.clickTrack(2);
    await player.clickTrack(3);

    await expect(player.trackTitle).toHaveText('Cloud Nine');
    const activeItems = page.locator('.tracklist-item.active');
    await expect(activeItems).toHaveCount(1);
  });

  test('BPM display shows correct suffix via CSS ::after — element text is numeric only', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(0); // BPM 122
    // The CSS ::after pseudo-element appends " BPM"; the raw text content is just the number
    await expect(player.metaBpm).toHaveText('122');
  });

  test('all genre filter buttons are visible and interactive', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await player.goto();

    const genreLabels = ['All', 'Deep House', 'Techno', 'DnB', 'Progressive', 'Synthwave', 'Garage'];
    for (const label of genreLabels) {
      await expect(player.genreBtn(label)).toBeVisible();
    }
  });

  test('app layout is present at desktop viewport (900 px wide)', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await player.goto();

    await expect(player.nowPlayingSection).toBeVisible();
    await expect(player.transportSection).toBeVisible();
    await expect(player.librarySection).toBeVisible();
  });

  test('app layout is present at mobile viewport (375 px wide)', async ({ page }) => {
    const player = new DjPlayerPage(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await player.goto();

    // Core sections remain visible on mobile
    await expect(player.nowPlayingSection).toBeVisible();
    await expect(player.trackTitle).toBeVisible();
    await expect(player.btnPlay).toBeVisible();
  });

  test('typing in search does not fire global Space shortcut', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.searchInput.focus();
    await page.keyboard.type('liquid '); // includes a space

    // Space in search field must not trigger play
    await expect(player.trackTitle).toHaveText('No track selected');
    // Search value should include the space
    await expect(player.searchInput).toHaveValue('liquid ');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13 · VISUAL FEEDBACK
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Visual feedback', () => {
  test('EQ bars appear on the active track while playing', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(0);
    // The active track's number column should show EQ bars while playing
    const activeItem = page.locator('.tracklist-item.active');
    await expect(activeItem.locator('.eq-bars')).toBeVisible();
  });

  test('EQ bars disappear when playback is paused', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(0);
    await expect(page.locator('.tracklist-item.active .eq-bars')).toBeVisible();

    await player.btnPause.click();
    // After pausing, the EQ bars should be replaced by the track number
    await expect(page.locator('.tracklist-item.active .eq-bars')).toHaveCount(0);
  });

  test('EQ bars move to the new track when switching tracks', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    await player.clickTrack(0);
    await expect(player.trackItem(0).locator('.eq-bars')).toBeVisible();

    await player.clickTrack(2);
    // EQ bars should now be on track 3, not track 1
    await expect(player.trackItem(0).locator('.eq-bars')).toHaveCount(0);
    await expect(player.trackItem(2).locator('.eq-bars')).toBeVisible();
  });

  test('volume persists when switching tracks', async ({ page }) => {
    await stubAudio(page);
    const player = new DjPlayerPage(page);
    await player.goto();

    // Set volume to 40%
    await player.volumeSlider.fill('40');
    await expect(player.volumeValue).toHaveText('40%');

    await player.clickTrack(0);
    await player.clickTrack(2);

    // Volume should still be 40% after switching tracks
    await expect(player.volumeValue).toHaveText('40%');
  });
});
