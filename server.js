const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// ── Track Data ──────────────────────────────────────────
const DEFAULT_TRACKS = [
  { id: 1, title: 'Midnight Sessions', artist: 'DJ Anna P', bpm: 122, genre: 'Deep House', key: 'Am', duration: 20, freq: 220, color: '#8b5cf6' },
  { id: 2, title: 'Warehouse Echoes', artist: 'DJ Anna P', bpm: 138, genre: 'Techno', key: 'Dm', duration: 25, freq: 150, color: '#ef4444' },
  { id: 3, title: 'Liquid Sunshine', artist: 'DJ Anna P', bpm: 174, genre: 'Drum & Bass', key: 'Fm', duration: 15, freq: 110, color: '#22c55e' },
  { id: 4, title: 'Cloud Nine', artist: 'DJ Anna P', bpm: 128, genre: 'Progressive House', key: 'Cm', duration: 30, freq: 330, color: '#06b6d4' },
  { id: 5, title: 'Neon Dreams', artist: 'DJ Anna P', bpm: 110, genre: 'Synthwave', key: 'Em', duration: 20, freq: 440, color: '#f59e0b' },
  { id: 6, title: 'Bass Culture', artist: 'DJ Anna P', bpm: 130, genre: 'UK Garage', key: 'Gm', duration: 18, freq: 185, color: '#ec4899' },
];

let tracks = structuredClone(DEFAULT_TRACKS);
let nextId = 7;

// ── API Routes ──────────────────────────────────────────

// Reset tracks to defaults (for testing)
app.post('/api/tracks/reset', (req, res) => {
  tracks = structuredClone(DEFAULT_TRACKS);
  nextId = 7;
  res.status(204).send();
});

// List tracks with optional genre and search filters
app.get('/api/tracks', (req, res) => {
  let result = [...tracks];

  if (req.query.genre) {
    result = result.filter(t => t.genre === req.query.genre);
  }

  if (req.query.search) {
    const q = req.query.search.toLowerCase();
    result = result.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.genre.toLowerCase().includes(q)
    );
  }

  res.json(result);
});

// Get single track by ID
app.get('/api/tracks/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid track ID' });

  const track = tracks.find(t => t.id === id);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  res.json(track);
});

// Create a new track
app.post('/api/tracks', (req, res) => {
  const { title, artist, bpm, genre, key, duration, freq, color } = req.body;

  if (!title || !artist) {
    return res.status(400).json({ error: 'Title and artist are required' });
  }

  const track = { id: nextId++, title, artist, bpm, genre, key, duration, freq, color };
  tracks.push(track);
  res.status(201).json(track);
});

// Delete a track
app.delete('/api/tracks/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid track ID' });

  const index = tracks.findIndex(t => t.id === id);
  if (index === -1) return res.status(404).json({ error: 'Track not found' });

  tracks.splice(index, 1);
  res.status(204).send();
});

// ── Static Files ────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'app')));

// ── Start Server ────────────────────────────────────────
const PORT = process.env.PORT || 4173;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
