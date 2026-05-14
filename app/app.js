// ── Track Data ──────────────────────────────────────────
// Loaded from /api/tracks on init
let TRACKS = [];

// ── State ───────────────────────────────────────────────
let currentTrackIndex = -1;
let isPlaying = false;
let audio = null;
let audioContext = null;
let analyser = null;
let animFrameId = null;
let isSeeking = false;

// ── DOM refs ────────────────────────────────────────────
const app = document.querySelector('.app');
const trackTitle = document.querySelector('.track-title');
const trackArtist = document.querySelector('.track-artist');
const metaBpm = document.querySelector('.meta-bpm');
const metaGenre = document.querySelector('.meta-genre');
const metaKey = document.querySelector('.meta-key');
const waveformCanvas = document.querySelector('.waveform');
const waveformCtx = waveformCanvas.getContext('2d');
const timeCurrent = document.querySelector('.time-current');
const timeDuration = document.querySelector('.time-duration');
const progressTrack = document.querySelector('.progress-track');
const progressFill = document.querySelector('.progress-fill');
const progressHandle = document.querySelector('.progress-handle');
const btnPlay = document.querySelector('.btn-play');
const iconPlay = document.querySelector('.icon-play');
const iconPause = document.querySelector('.icon-pause');
const btnPrev = document.querySelector('.btn-prev');
const btnNext = document.querySelector('.btn-next');
const btnMute = document.querySelector('.btn-mute');
const iconVolOn = document.querySelector('.icon-vol-on');
const iconVolOff = document.querySelector('.icon-vol-off');
const volumeSlider = document.querySelector('.volume-slider');
const volumeValue = document.querySelector('.volume-value');
const searchInput = document.querySelector('.search-input');
const genreButtons = document.querySelectorAll('.genre-btn');
const tracklistItems = document.querySelector('.tracklist-items');
const noResults = document.querySelector('.no-results');

// ── Audio Generation ────────────────────────────────────
// Creates synthetic WAV audio so the player works without external files
function generateWav(track) {
  const sampleRate = 44100;
  const numSamples = sampleRate * track.duration;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // WAV header
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const beatHz = track.bpm / 60;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.max(0, 1 - ((t * beatHz) % 1) * 2);

    // Base tone + harmonics
    let sample = Math.sin(2 * Math.PI * track.freq * t);
    sample += 0.4 * Math.sin(2 * Math.PI * track.freq * 2 * t);
    sample += 0.2 * Math.sin(2 * Math.PI * track.freq * 0.5 * t);

    // Rhythmic envelope
    sample *= 0.3 + 0.7 * env;

    // Subtle movement
    sample *= 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.25 * t);

    // Master volume
    sample *= 0.25;

    // Fade in/out
    const fade = 0.5;
    if (t < fade) sample *= t / fade;
    if (t > track.duration - fade) sample *= (track.duration - t) / fade;

    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, clamped * 32767, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// ── Tracklist Rendering ─────────────────────────────────
function formatTime(seconds) {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function renderTracklist(tracks) {
  tracklistItems.innerHTML = '';
  const hasResults = tracks.length > 0;
  noResults.style.display = hasResults ? 'none' : 'block';

  tracks.forEach((track, displayIndex) => {
    const li = document.createElement('li');
    li.className = 'tracklist-item';
    li.dataset.trackId = track.id;
    if (currentTrackIndex >= 0 && TRACKS[currentTrackIndex].id === track.id) {
      li.classList.add('active');
    }
    li.setAttribute('role', 'listitem');
    li.setAttribute('tabindex', '0');

    const numContent = li.classList.contains('active') && isPlaying
      ? '<div class="eq-bars"><span></span><span></span><span></span></div>'
      : (displayIndex + 1);

    li.innerHTML = `
      <span class="item-num">${numContent}</span>
      <div class="item-title-group">
        <div class="item-title">${track.title}</div>
        <div class="item-artist">${track.artist}</div>
      </div>
      <span class="item-bpm">${track.bpm}</span>
      <span class="item-genre">${track.genre}</span>
      <span class="item-key">${track.key}</span>
      <span class="item-duration">${formatTime(track.duration)}</span>
    `;

    li.addEventListener('click', () => loadTrack(TRACKS.indexOf(track)));
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        loadTrack(TRACKS.indexOf(track));
      }
    });

    tracklistItems.appendChild(li);
  });
}

// ── Filtering ───────────────────────────────────────────
let activeGenre = 'all';
let searchQuery = '';

function getFilteredTracks() {
  return TRACKS.filter((track) => {
    const matchesGenre = activeGenre === 'all' || track.genre === activeGenre;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      track.title.toLowerCase().includes(q) ||
      track.artist.toLowerCase().includes(q) ||
      track.genre.toLowerCase().includes(q) ||
      track.key.toLowerCase().includes(q);
    return matchesGenre && matchesSearch;
  });
}

function applyFilters() {
  renderTracklist(getFilteredTracks());
}

searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  applyFilters();
});

genreButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    activeGenre = btn.dataset.genre;
    genreButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
  });
});

// ── Audio Playback ──────────────────────────────────────
function loadTrack(index) {
  if (index < 0 || index >= TRACKS.length) return;

  const wasPlaying = isPlaying;
  if (audio) {
    audio.pause();
    audio.src = '';
  }

  currentTrackIndex = index;
  const track = TRACKS[index];

  // Generate audio
  const blob = generateWav(track);
  audio = new Audio(URL.createObjectURL(blob));
  audio.volume = volumeSlider.value / 100;

  // Update now playing
  trackTitle.textContent = track.title;
  trackArtist.textContent = track.artist;
  metaBpm.textContent = track.bpm;
  metaGenre.textContent = track.genre;
  metaKey.textContent = track.key;
  timeDuration.textContent = formatTime(track.duration);

  // Set up Web Audio API for waveform
  setupAnalyser();

  // Events
  audio.addEventListener('timeupdate', onTimeUpdate);
  audio.addEventListener('ended', onTrackEnd);
  audio.addEventListener('loadedmetadata', () => {
    timeDuration.textContent = formatTime(audio.duration);
  });

  applyFilters();

  // Auto-play if we were playing or if user clicked a track
  if (wasPlaying || !isPlaying) {
    play();
  }
}

function setupAnalyser() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
  } catch (e) {
    // Web Audio API not available — waveform won't animate but player still works
    analyser = null;
  }
}

function play() {
  if (!audio) return;
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
  audio.play().then(() => {
    isPlaying = true;
    app.classList.add('playing');
    iconPlay.style.display = 'none';
    iconPause.style.display = 'block';
    btnPlay.setAttribute('aria-label', 'Pause');
    applyFilters();
    drawWaveform();
  }).catch(() => {
    // Autoplay blocked — user needs to interact first
  });
}

function pause() {
  if (!audio) return;
  audio.pause();
  isPlaying = false;
  app.classList.remove('playing');
  iconPlay.style.display = 'block';
  iconPause.style.display = 'none';
  btnPlay.setAttribute('aria-label', 'Play');
  applyFilters();
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

function togglePlay() {
  if (currentTrackIndex === -1) {
    loadTrack(0);
    return;
  }
  isPlaying ? pause() : play();
}

function nextTrack() {
  const next = (currentTrackIndex + 1) % TRACKS.length;
  loadTrack(next);
}

function prevTrack() {
  if (audio && audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  const prev = (currentTrackIndex - 1 + TRACKS.length) % TRACKS.length;
  loadTrack(prev);
}

function onTrackEnd() {
  nextTrack();
}

function onTimeUpdate() {
  if (isSeeking || !audio) return;
  const pct = (audio.currentTime / audio.duration) * 100 || 0;
  progressFill.style.width = pct + '%';
  progressHandle.style.left = pct + '%';
  progressTrack.setAttribute('aria-valuenow', Math.round(pct));
  timeCurrent.textContent = formatTime(audio.currentTime);
}

// ── Progress Bar Seeking ────────────────────────────────
function seekFromEvent(e) {
  if (!audio) return;
  const rect = progressTrack.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audio.currentTime = pct * audio.duration;
  progressFill.style.width = (pct * 100) + '%';
  progressHandle.style.left = (pct * 100) + '%';
  timeCurrent.textContent = formatTime(audio.currentTime);
}

progressTrack.addEventListener('mousedown', (e) => {
  isSeeking = true;
  seekFromEvent(e);
  const onMove = (ev) => seekFromEvent(ev);
  const onUp = () => {
    isSeeking = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});

progressTrack.addEventListener('keydown', (e) => {
  if (!audio) return;
  if (e.key === 'ArrowRight') {
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
  } else if (e.key === 'ArrowLeft') {
    audio.currentTime = Math.max(0, audio.currentTime - 5);
  }
});

// ── Volume ──────────────────────────────────────────────
let savedVolume = 80;

function setVolume(val) {
  if (audio) audio.volume = val / 100;
  volumeSlider.value = val;
  volumeValue.textContent = val + '%';

  if (val === 0) {
    iconVolOn.style.display = 'none';
    iconVolOff.style.display = 'block';
    btnMute.setAttribute('aria-label', 'Unmute');
  } else {
    iconVolOn.style.display = 'block';
    iconVolOff.style.display = 'none';
    btnMute.setAttribute('aria-label', 'Mute');
  }
}

volumeSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  savedVolume = val > 0 ? val : savedVolume;
  setVolume(val);
});

btnMute.addEventListener('click', () => {
  const currentVol = parseInt(volumeSlider.value, 10);
  if (currentVol > 0) {
    savedVolume = currentVol;
    setVolume(0);
  } else {
    setVolume(savedVolume);
  }
});

// ── Waveform Visualization ──────────────────────────────
function drawWaveform() {
  if (!analyser) {
    drawStaticWaveform();
    return;
  }

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    if (!isPlaying) return;
    animFrameId = requestAnimationFrame(draw);

    analyser.getByteFrequencyData(dataArray);

    const w = waveformCanvas.width;
    const h = waveformCanvas.height;
    waveformCtx.clearRect(0, 0, w, h);

    const track = TRACKS[currentTrackIndex];
    const barWidth = (w / bufferLength) * 2;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * h * 0.85;

      const gradient = waveformCtx.createLinearGradient(0, h - barHeight, 0, h);
      gradient.addColorStop(0, track ? track.color : '#8b5cf6');
      gradient.addColorStop(1, 'rgba(139,92,246,0.1)');
      waveformCtx.fillStyle = gradient;

      waveformCtx.fillRect(x, h - barHeight, barWidth - 1, barHeight);
      x += barWidth;
    }
  }

  draw();
}

function drawStaticWaveform() {
  const w = waveformCanvas.width;
  const h = waveformCanvas.height;
  waveformCtx.clearRect(0, 0, w, h);

  const track = TRACKS[currentTrackIndex];
  if (!track) return;

  waveformCtx.fillStyle = track.color + '40';
  const bars = 64;
  const barW = w / bars;
  for (let i = 0; i < bars; i++) {
    const barH = (Math.sin(i * 0.3 + track.freq * 0.01) * 0.5 + 0.5) * h * 0.6 + 4;
    waveformCtx.fillRect(i * barW, h - barH, barW - 1, barH);
  }
}

// ── Keyboard Shortcuts ──────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Don't intercept when typing in search
  if (e.target === searchInput) return;

  switch (e.key) {
    case ' ':
      e.preventDefault();
      togglePlay();
      break;
    case 'ArrowRight':
      if (e.shiftKey) nextTrack();
      else if (audio) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
      break;
    case 'ArrowLeft':
      if (e.shiftKey) prevTrack();
      else if (audio) audio.currentTime = Math.max(0, audio.currentTime - 5);
      break;
    case 'ArrowUp':
      e.preventDefault();
      setVolume(Math.min(100, parseInt(volumeSlider.value, 10) + 5));
      break;
    case 'ArrowDown':
      e.preventDefault();
      setVolume(Math.max(0, parseInt(volumeSlider.value, 10) - 5));
      break;
    case 'm':
    case 'M':
      btnMute.click();
      break;
  }
});

// ── Button Listeners ────────────────────────────────────
btnPlay.addEventListener('click', togglePlay);
btnNext.addEventListener('click', nextTrack);
btnPrev.addEventListener('click', prevTrack);

// ── Init ────────────────────────────────────────────────
fetch('/api/tracks')
  .then((res) => res.json())
  .then((data) => {
    TRACKS = data;
    renderTracklist(TRACKS);
  })
  .catch(() => {
    // API unavailable — render empty tracklist
    renderTracklist([]);
  });
