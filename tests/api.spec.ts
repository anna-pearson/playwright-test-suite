import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// API TESTING
// Uses Playwright's APIRequestContext to test the REST API endpoints directly —
// no browser needed. Covers CRUD operations, filtering, validation, error
// handling, status codes, and response schemas.
// ─────────────────────────────────────────────────────────────────────────────

// Reset server state before each test so mutations don't leak between tests
test.beforeEach(async ({ request }) => {
  await request.post('/api/tracks/reset');
});

test.describe('GET /api/tracks', () => {
  test('returns all 6 tracks', async ({ request }) => {
    const response = await request.get('/api/tracks');

    expect(response.status()).toBe(200);
    const tracks = await response.json();
    expect(tracks).toHaveLength(6);
  });

  test('returns JSON content-type', async ({ request }) => {
    const response = await request.get('/api/tracks');

    expect(response.headers()['content-type']).toContain('application/json');
  });

  test('each track has all required fields', async ({ request }) => {
    const response = await request.get('/api/tracks');
    const tracks = await response.json();

    for (const track of tracks) {
      expect(track).toHaveProperty('id');
      expect(track).toHaveProperty('title');
      expect(track).toHaveProperty('artist');
      expect(track).toHaveProperty('bpm');
      expect(track).toHaveProperty('genre');
      expect(track).toHaveProperty('key');
      expect(track).toHaveProperty('duration');
      expect(track).toHaveProperty('freq');
      expect(track).toHaveProperty('color');
    }
  });

  test('tracks have correct data types', async ({ request }) => {
    const response = await request.get('/api/tracks');
    const tracks = await response.json();
    const track = tracks[0];

    expect(typeof track.id).toBe('number');
    expect(typeof track.title).toBe('string');
    expect(typeof track.artist).toBe('string');
    expect(typeof track.bpm).toBe('number');
    expect(typeof track.genre).toBe('string');
    expect(typeof track.key).toBe('string');
    expect(typeof track.duration).toBe('number');
  });

  test('tracks are returned in correct order', async ({ request }) => {
    const response = await request.get('/api/tracks');
    const tracks = await response.json();

    expect(tracks[0].title).toBe('Midnight Sessions');
    expect(tracks[5].title).toBe('Bass Culture');
  });
});

test.describe('GET /api/tracks — filtering', () => {
  test('?genre filters by exact genre match', async ({ request }) => {
    const response = await request.get('/api/tracks?genre=Techno');
    const tracks = await response.json();

    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe('Warehouse Echoes');
  });

  test('?genre=Deep House returns only Deep House tracks', async ({ request }) => {
    const response = await request.get('/api/tracks?genre=Deep%20House');
    const tracks = await response.json();

    expect(tracks).toHaveLength(1);
    expect(tracks[0].genre).toBe('Deep House');
  });

  test('?genre with no matches returns empty array', async ({ request }) => {
    const response = await request.get('/api/tracks?genre=Jazz');
    const tracks = await response.json();

    expect(response.status()).toBe(200);
    expect(tracks).toHaveLength(0);
  });

  test('?search matches track title', async ({ request }) => {
    const response = await request.get('/api/tracks?search=midnight');
    const tracks = await response.json();

    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe('Midnight Sessions');
  });

  test('?search matches artist name', async ({ request }) => {
    const response = await request.get('/api/tracks?search=anna');
    const tracks = await response.json();

    // All tracks are by DJ Anna P
    expect(tracks).toHaveLength(6);
  });

  test('?search matches genre', async ({ request }) => {
    const response = await request.get('/api/tracks?search=house');
    const tracks = await response.json();

    // Deep House + Warehouse Echoes (title) + Progressive House
    expect(tracks).toHaveLength(3);
  });

  test('?search is case-insensitive', async ({ request }) => {
    const response = await request.get('/api/tracks?search=NEON');
    const tracks = await response.json();

    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe('Neon Dreams');
  });

  test('?search with no matches returns empty array', async ({ request }) => {
    const response = await request.get('/api/tracks?search=nonexistent');
    const tracks = await response.json();

    expect(response.status()).toBe(200);
    expect(tracks).toHaveLength(0);
  });

  test('?genre and ?search combine as AND filter', async ({ request }) => {
    const response = await request.get('/api/tracks?genre=Techno&search=warehouse');
    const tracks = await response.json();

    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe('Warehouse Echoes');
  });

  test('?genre and ?search with conflicting filters returns empty', async ({ request }) => {
    const response = await request.get('/api/tracks?genre=Techno&search=midnight');
    const tracks = await response.json();

    expect(tracks).toHaveLength(0);
  });
});

test.describe('GET /api/tracks/:id', () => {
  test('returns the correct track for a valid ID', async ({ request }) => {
    const response = await request.get('/api/tracks/1');
    const track = await response.json();

    expect(response.status()).toBe(200);
    expect(track.id).toBe(1);
    expect(track.title).toBe('Midnight Sessions');
    expect(track.artist).toBe('DJ Anna P');
    expect(track.bpm).toBe(122);
    expect(track.genre).toBe('Deep House');
  });

  test('returns 404 for a nonexistent ID', async ({ request }) => {
    const response = await request.get('/api/tracks/999', {
      failOnStatusCode: false,
    });
    const body = await response.json();

    expect(response.status()).toBe(404);
    expect(body.error).toBe('Track not found');
  });

  test('returns 400 for a non-numeric ID', async ({ request }) => {
    const response = await request.get('/api/tracks/abc', {
      failOnStatusCode: false,
    });
    const body = await response.json();

    expect(response.status()).toBe(400);
    expect(body.error).toBe('Invalid track ID');
  });
});

test.describe('POST /api/tracks', () => {
  test('creates a new track and returns 201', async ({ request }) => {
    const newTrack = {
      title: 'Test Track',
      artist: 'Test Artist',
      bpm: 140,
      genre: 'Trance',
      key: 'Bm',
      duration: 22,
    };

    const response = await request.post('/api/tracks', { data: newTrack });
    const created = await response.json();

    expect(response.status()).toBe(201);
    expect(created.id).toBeDefined();
    expect(created.title).toBe('Test Track');
    expect(created.artist).toBe('Test Artist');
    expect(created.bpm).toBe(140);
    expect(created.genre).toBe('Trance');
  });

  test('created track appears in GET /api/tracks', async ({ request }) => {
    await request.post('/api/tracks', {
      data: { title: 'New One', artist: 'Someone', bpm: 120, genre: 'House' },
    });

    const response = await request.get('/api/tracks');
    const tracks = await response.json();

    expect(tracks).toHaveLength(7);
    expect(tracks[6].title).toBe('New One');
  });

  test('created track is retrievable by ID', async ({ request }) => {
    const createRes = await request.post('/api/tracks', {
      data: { title: 'Findable', artist: 'Someone', bpm: 130, genre: 'House' },
    });
    const created = await createRes.json();

    const getRes = await request.get(`/api/tracks/${created.id}`);
    const fetched = await getRes.json();

    expect(fetched.title).toBe('Findable');
  });

  test('assigns a unique auto-incrementing ID', async ({ request }) => {
    const res1 = await request.post('/api/tracks', {
      data: { title: 'First', artist: 'A' },
    });
    const res2 = await request.post('/api/tracks', {
      data: { title: 'Second', artist: 'B' },
    });

    const track1 = await res1.json();
    const track2 = await res2.json();

    expect(track2.id).toBeGreaterThan(track1.id);
  });

  test('returns 400 when title is missing', async ({ request }) => {
    const response = await request.post('/api/tracks', {
      data: { artist: 'Someone' },
      failOnStatusCode: false,
    });
    const body = await response.json();

    expect(response.status()).toBe(400);
    expect(body.error).toContain('required');
  });

  test('returns 400 when artist is missing', async ({ request }) => {
    const response = await request.post('/api/tracks', {
      data: { title: 'No Artist' },
      failOnStatusCode: false,
    });
    const body = await response.json();

    expect(response.status()).toBe(400);
    expect(body.error).toContain('required');
  });

  test('returns 400 when body is empty', async ({ request }) => {
    const response = await request.post('/api/tracks', {
      data: {},
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(400);
  });
});

test.describe('DELETE /api/tracks/:id', () => {
  test('deletes an existing track and returns 204', async ({ request }) => {
    const response = await request.delete('/api/tracks/1');

    expect(response.status()).toBe(204);
  });

  test('deleted track is removed from GET /api/tracks', async ({ request }) => {
    await request.delete('/api/tracks/1');

    const response = await request.get('/api/tracks');
    const tracks = await response.json();

    expect(tracks).toHaveLength(5);
    expect(tracks.find((t: { id: number }) => t.id === 1)).toBeUndefined();
  });

  test('deleted track returns 404 on GET', async ({ request }) => {
    await request.delete('/api/tracks/1');

    const response = await request.get('/api/tracks/1', {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(404);
  });

  test('returns 404 when deleting nonexistent track', async ({ request }) => {
    const response = await request.delete('/api/tracks/999', {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(404);
  });

  test('returns 400 for non-numeric ID', async ({ request }) => {
    const response = await request.delete('/api/tracks/abc', {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(400);
  });
});

test.describe('API — static assets', () => {
  test('GET / returns HTML', async ({ request }) => {
    const response = await request.get('/');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
  });

  test('GET /nonexistent returns 404', async ({ request }) => {
    const response = await request.get('/nonexistent-page.html', {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(404);
  });

  test('server handles concurrent requests', async ({ request }) => {
    const responses = await Promise.all([
      request.get('/api/tracks'),
      request.get('/api/tracks/1'),
      request.get('/api/tracks/2'),
      request.get('/api/tracks?genre=Techno'),
      request.get('/'),
    ]);

    for (const response of responses) {
      expect(response.status()).toBe(200);
    }
  });
});

test.describe('POST /api/tracks — edge cases', () => {
  test('creating a track with only required fields leaves optional fields undefined', async ({ request }) => {
    const response = await request.post('/api/tracks', {
      data: { title: 'Minimal', artist: 'Test' },
    });
    const track = await response.json();

    expect(response.status()).toBe(201);
    expect(track.title).toBe('Minimal');
    expect(track.bpm).toBeUndefined();
    expect(track.genre).toBeUndefined();
    expect(track.freq).toBeUndefined();
    expect(track.color).toBeUndefined();
  });

  test('rejects empty string as title', async ({ request }) => {
    const response = await request.post('/api/tracks', {
      data: { title: '', artist: 'Someone' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(400);
  });

  test('rejects empty string as artist', async ({ request }) => {
    const response = await request.post('/api/tracks', {
      data: { title: 'Has Title', artist: '' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(400);
  });
});

test.describe('POST /api/tracks/reset', () => {
  test('reset returns 204', async ({ request }) => {
    const response = await request.post('/api/tracks/reset');
    expect(response.status()).toBe(204);
  });

  test('reset restores exactly 6 default tracks', async ({ request }) => {
    // Create and delete tracks to dirty the state
    await request.post('/api/tracks', {
      data: { title: 'Extra', artist: 'Test' },
    });
    await request.delete('/api/tracks/1');

    // State is now 6 tracks (5 originals + 1 new)
    await request.post('/api/tracks/reset');

    const response = await request.get('/api/tracks');
    const tracks = await response.json();
    expect(tracks).toHaveLength(6);
    expect(tracks[0].title).toBe('Midnight Sessions');
    expect(tracks[5].title).toBe('Bass Culture');
  });

  test('reset resets the ID counter (next track gets ID 7)', async ({ request }) => {
    // Create a track (gets ID 7), then reset
    await request.post('/api/tracks', {
      data: { title: 'Before Reset', artist: 'Test' },
    });
    await request.post('/api/tracks/reset');

    // After reset, next new track should get ID 7 again
    const response = await request.post('/api/tracks', {
      data: { title: 'After Reset', artist: 'Test' },
    });
    const track = await response.json();
    expect(track.id).toBe(7);
  });
});

test.describe('DELETE then re-check IDs', () => {
  test('deleted IDs are not reused by POST', async ({ request }) => {
    // Delete track 6, then create a new one — should get ID 7, not 6
    await request.delete('/api/tracks/6');
    const response = await request.post('/api/tracks', {
      data: { title: 'New After Delete', artist: 'Test' },
    });
    const track = await response.json();

    expect(track.id).toBe(7);
  });
});
