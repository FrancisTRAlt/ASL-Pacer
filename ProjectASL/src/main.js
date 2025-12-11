// ===================== 
// Global test override 
// ===================== 
// Set NET_TEST_OVERRIDE to: 
// null -> use real navigator.onLine (default) 
// true -> force ONLINE (testing) 
// false -> force OFFLINE (testing) 
let NET_TEST_OVERRIDE = null;
// Helper: determine online state (uses override if set) 
function isOnline() {
  return (NET_TEST_OVERRIDE === null) ? navigator.onLine : !!NET_TEST_OVERRIDE;
}
// ===================== 
// UI elements and state 
// ===================== 
let buttons = [];
let currentPage = "loading";
const backgroundColor = "#0066dbff";

// Loading screen state 
let isLoading = true;
let progress = 0;
let targetProgress = 0;

// Fade transition state 
let isFading = false;
let fadeAlpha = 0;

// leaderboard data
let aslLeaderboardData = [];
let supabaseClient = null;

// --- Connectivity --- 
let offlineMode = false; // true when isOnline() === false 
let musicControlsVisible = false; // track if URL controls are visible

// --- MUSIC HUD --- 
let bgMusic = null; // facade provided by index.html 
const musicUI = {
  panelW: 180,
  panelH: 60,
  padding: 16,
  x: 0, y: 0,
  btnSize: 40,
  playRect: { x: 0, y: 0, w: 40, h: 40 },
  muteRect: { x: 0, y: 0, w: 40, h: 40 }
};

// --- MUSIC URL CONTROLS (DOM on main menu) --- 
let ytUrlInput = null;
let ytUrlLoadBtn = null;

// ---------------- AUDIO VISUALIZER (Title bar) ---------------- 
let visualizerActive = false;
let audioAnalyser = null;
let audioCtx = null;
let freqData = null;
let visualizerMode = "synthetic"; // "analyser" if we hook into real audio 
let analyserInitTried = false;
let syntheticPhase = 0;
// Attempt to initialize an analyser from the bgMusic facade or media element. 
// Falls back to "synthetic" animation if none is available. 
function initAudioAnalyzer() {
  if (analyserInitTried) return visualizerMode === "analyser";
  analyserInitTried = true;
  try {
    // If facade exposes an AnalyserNode directly 
    if (bgMusic?.getAnalyser) {
      audioAnalyser = bgMusic.getAnalyser(); // expected to be an AnalyserNode 
      if (audioAnalyser) {
        freqData = new Uint8Array(audioAnalyser.frequencyBinCount);
        audioCtx = audioAnalyser.context ?? null;
        visualizerMode = "analyser";
        return true;
      }
    }
    // If facade exposes the underlying HTMLMediaElement 
    if (bgMusic?.getMediaElement) {
      const el = bgMusic.getMediaElement(); // HTMLMediaElement 
      if (el) {
        const Ctx = window.AudioContext ?? window.webkitAudioContext;
        audioCtx = new Ctx();
        const sourceNode = audioCtx.createMediaElementSource(el);
        audioAnalyser = audioCtx.createAnalyser();
        audioAnalyser.fftSize = 1024;
        sourceNode.connect(audioAnalyser);
        // Do NOT connect analyser to destination to avoid audio duplication. 
        // The element renders audio by itself. 
        freqData = new Uint8Array(audioAnalyser.frequencyBinCount);
        visualizerMode = "analyser";
        return true;
      }
    }
  } catch (e) {
    // If we fail, we will use synthetic animation instead. 
    console.warn("Audio analyser init failed:", e);
  }
  visualizerMode = "synthetic";
  return false;
}

function updateVisualizerState() {
  const playing = !offlineMode && bgMusic && bgMusic.ready && !bgMusic.isPaused();
  visualizerActive = !!playing;
  // Initialize analyser lazily when playback starts (and only once) 
  if (visualizerActive && !audioAnalyser && !analyserInitTried) {
    initAudioAnalyzer();
    // Resume context on user gesture if needed 
    if (audioCtx?.state === "suspended") {
      audioCtx.resume().catch(() => { });
    }
  }
}

function drawTitleAudioVisualizer() {
  if (offlineMode || !visualizerActive) return;
  // Title banner area (compact): 
  const bannerTop = 0;
  const bannerHeight = 72; // reduced from 87 
  const areaY = bannerTop + 8; // inset 
  const areaH = bannerHeight - 16; // inset height 
  const barCount = 36;
  const barGap = 2;
  const barW = (width - (barCount - 1) * barGap) / barCount;
  let levels = new Array(barCount).fill(0);
  if (visualizerMode === "analyser" && audioAnalyser && freqData) {
    audioAnalyser.getByteFrequencyData(freqData);
    // Map frequency bins to bars (log-ish grouping) 
    for (let i = 0; i < barCount; i++) {
      const start = Math.floor(i * freqData.length / barCount);
      const end = Math.floor((i + 1) * freqData.length / barCount);
      let sum = 0, count = Math.max(1, end - start);
      for (let k = start; k < end; k++) sum += freqData[k];
      const avg = sum / count; // 0..255 
      levels[i] = avg / 255; // normalize 0..1 
    }
  } else {
    // Synthetic waveform animation when analyser not available 
    syntheticPhase += 0.08;
    for (let i = 0; i < barCount; i++) {
      const base = Math.sin(syntheticPhase + i * 0.25) * 0.5 + 0.5; // 0..1 
      const wobble = Math.sin(syntheticPhase * 0.7 + i * 0.6) * 0.25 + 0.25; // 0..0.5 
      levels[i] = Math.min(1, base * 0.7 + wobble * 0.3);
    }
  }
  // Draw bars with a cyan-to-sky gradient, lightly translucent 
  push();
  noStroke();
  for (let i = 0; i < barCount; i++) {
    const x = i * (barW + barGap);
    const h = levels[i] * areaH;
    const y = areaY + areaH - h;
    // gradient color per bar 
    const cTop = color(0, 255, 255, 140); // cyan 
    const cBot = color(135, 206, 235, 180); // sky 
    const inter = levels[i];
    fill(lerpColor(cTop, cBot, inter));
    rect(x, y, barW, h, 4);
  }
  pop();
  // Optional glow line 
  push();
  const glowY = areaY + areaH * 0.15 + Math.sin(syntheticPhase * 0.5) * 6;
  stroke(135, 206, 235, 140);
  strokeWeight(2);
  line(0, glowY, width, glowY);
  pop();
}




// ------------- BUTTON CLASS ------------- 
class Button {
  constructor(x, y, w, h, label, callback, opts = {}) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.label = label;
    this.callback = callback;
    this.visible = true;
    this.disabled = !!opts.disabled;
    this.tooltip = opts.tooltip ?? null;
  }
  show() {
    if (!this.visible) return;
    const hovered = !this.disabled && this.isHovered();
    fill(hovered ? color(100, 150, 255) : (this.disabled ? color(60) : 80));
    rect(this.x, this.y, this.w, this.h, 10);
    fill(this.disabled ? 200 : 255);
    textAlign(CENTER, CENTER);
    textSize(24);
    text(this.label, this.x + this.w / 2, this.y + this.h / 2);
    if (hovered && this.tooltip) {
      push();
      textAlign(CENTER, TOP);
      textSize(14);
      fill(255);
      text(this.tooltip, this.x + this.w / 2, this.y + this.h + 8);
      pop();
    }
  }
  isHovered() {
    return this.visible &&
      mouseX > this.x && mouseX < this.x + this.w &&
      mouseY > this.y && mouseY < this.y + this.h;
  }
  click() {
    if (this.visible && !this.disabled && this.isHovered()) {
      this.callback();
    }
  }
}
function getVisibleButtons() {
  return buttons.filter(b => b.visible);
}




// ---------------------- SETUP ---------------------- 
async function setup() {
  createCanvas(800, 600);
  bgMusic = window.bgMusic ?? null;
  // Determine initial connectivity and set offline mode 
  offlineMode = !isOnline();
  // Setup leaderboard only if online 
  if (!offlineMode) {
    try {
      await loadConfigAndInitSupabase(); // uses fetch('config.json') 
      aslLeaderboardData = await fetchLeaderboard();
    } catch (e) {
      console.warn('Leaderboard unavailable:', e);
      aslLeaderboardData = [];
    }
  } else {
    aslLeaderboardData = []; // placeholder when offline 
  }
  // Start loading (no camera/model anymore) 
  isLoading = true;
  progress = 0;
  targetProgress = 100; // go straight to 100% 
  currentPage = "loading";
}




// ---------------------- DRAW ---------------------- 
function draw() {
  // Refresh offline state every frame (handles mid-session changes or test override) 
  const nowOffline = !isOnline();
  if (nowOffline !== offlineMode) {
    offlineMode = nowOffline;
    if (offlineMode) {
      destroyMusicUrlControls();
      musicControlsVisible = false;
      visualizerActive = false; // disable visualizer when offline 
    } else {
      if (currentPage === 'menu') {
        showMusicUrlControls();
        musicControlsVisible = true;
      }
      // Re-fetch leaderboard when coming back online if on leaderboard page 
      if (currentPage === 'aslLeaderboard') {
        loadConfigAndInitSupabase()
          .then(fetchLeaderboard)
          .then(data => { aslLeaderboardData = data ?? []; })
          .catch(() => { aslLeaderboardData = []; });
      }
    }
  }

  // Loading Screen 
  if (isLoading) {
    progress = lerp(progress, targetProgress, 0.05);
    drawLoadingScreen();
    if (progress >= 99) {
      progress = 100;
      isLoading = false;
      currentPage = "menu";
      setupMenuButtons();
      if (!offlineMode) {
        showMusicUrlControls();
        musicControlsVisible = true;
      }
    }
    return;
  }

  // Background & Title 
  drawSpaceBackground();
  drawTitle();

  // Status HUD (Online/Offline) + banner 
  drawOnlineStatus();
  if (offlineMode) drawOfflineBanner();

  // Page-specific content 
  if (currentPage === "singlePlayerInstruc") {
    drawSinglePlayerInstructions();
  } else if (currentPage === "MultiASLInstruc") {
    drawMultiASLInstructions();
  } else if (currentPage === "aslLeaderboard") {
    drawASLLeaderboard();
  } else if (currentPage === "credits") {
    fill(0);
    rect(width / 4, height / 4 - 50, width / 2, 170, 20);
    textSize(48);
    fill("SkyBlue");
    text("Credits", width / 2, height / 4);
    textSize(28);
    fill("SkyBlue");
    text("Developed by: Francis Tran", width / 2, height / 2 - 80);
    textSize(20);
    fill(180);
    text("© 2025 ASL Pacer Project", width / 2, height - 70);
  }

  // Update visualizer state based on music playback & offline mode 
  updateVisualizerState();

  // Draw buttons 
  drawButtons();

  // DRAW MUSIC HUD (hidden in offline mode) 
  if (!offlineMode) {
    if (!bgMusic && window.bgMusic) bgMusic = window.bgMusic; // late-binding 
    drawMusicHUD();
  }

  // Fade transition 
  if (isFading) {
    fadeAlpha = min(fadeAlpha + 10, 255);
    fill(0, fadeAlpha);
    rect(0, 0, width, height);
  }
}




// ---------------------- MENU BACKGROUND ---------------------- 
function drawSpaceBackground() {
  background(0);

  // --- One-time initialization ---
  if (!drawSpaceBackground.init) {
    noStroke();

    // Stars
    const numStars = 200;
    drawSpaceBackground.stars = new Array(numStars);
    for (let i = 0; i < numStars; i++) {
      drawSpaceBackground.stars[i] = {
        x: random(width),
        y: random(height),
        size: random(1, 3),
        phase: random(TWO_PI),
        speedX: random(-0.05, 0.05),
        speedY: random(-0.05, 0.05)
      };
    }

    // Planets (pre-render with pixel loop, pixelDensity-aware)
    const numPlanets = 6;
    drawSpaceBackground.planets = new Array(numPlanets);

    for (let i = 0; i < numPlanets; i++) {
      // Ensure integer size (avoid fractional width/height)
      const size = Math.round(random(50, 100));
      const seed = random(1000);

      // Color palette per planet (store RGBA arrays for faster writes)
      const colors = {
        water: [random(0, 150), random(50, 200), random(150, 255), 255],
        land: [random(50, 200), random(50, 150), random(0, 100), 255],
        ice: [random(180, 255), random(180, 255), random(180, 255), 255]
      };

      const pg = createGraphics(size, size); // 2D renderer
      pg.noStroke();
      pg.clear(); // start fully transparent

      // Properly handle high-DPI buffers
      const d = pg.pixelDensity();
      pg.loadPixels();

      const w = pg.width;
      const h = pg.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = size / 2;
      const r2 = radius * radius;

      const noiseScale = 0.02;

      // Helper to write RGBA quickly
      function writePixel(idx, rgba) {
        pg.pixels[idx + 0] = rgba[0];
        pg.pixels[idx + 1] = rgba[1];
        pg.pixels[idx + 2] = rgba[2];
        pg.pixels[idx + 3] = rgba[3];
      }

      // Iterate over *device* pixels (w*d by h*d) and map to logical coords
      for (let y = 0; y < h * d; y++) {
        const ly = y / d;              // logical y
        const dy = ly - cy;
        for (let x = 0; x < w * d; x++) {
          const lx = x / d;            // logical x
          const dx = lx - cx;
          const idx = 4 * (y * w * d + x);

          if (dx * dx + dy * dy <= r2) {
            // Inside circle: pick terrain color via noise
            const n = noise(dx * noiseScale + seed, dy * noiseScale + seed);
            const rgba = n < 0.4 ? colors.water : (n < 0.7 ? colors.land : colors.ice);
            writePixel(idx, rgba);
          } else {
            // Outside circle: keep transparent
            pg.pixels[idx + 0] = 0;
            pg.pixels[idx + 1] = 0;
            pg.pixels[idx + 2] = 0;
            pg.pixels[idx + 3] = 0;
          }
        }
      }
      pg.updatePixels();

      drawSpaceBackground.planets[i] = {
        x: random(width),
        y: random(height),
        size,
        seed,
        ring: random() < 0.3,
        speedX: random(-0.02, 0.02),
        speedY: random(-0.02, 0.02),
        rotation: random(TWO_PI),
        rotationSpeed: random(-0.005, 0.005),
        gfx: pg // cached image with proper alpha
      };
    }

    drawSpaceBackground.init = true;
  }

  // --- Stars ---
  const stars = drawSpaceBackground.stars;
  noStroke();
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const alpha = 100 + 155 * (0.5 + 0.5 * sin(frameCount * 0.02 + s.phase));
    fill(255, alpha);
    ellipse(s.x, s.y, s.size, s.size);
    s.x = (s.x + s.speedX + width) % width;
    s.y = (s.y + s.speedY + height) % height;
  }

  // --- Planets ---
  const planets = drawSpaceBackground.planets;
  imageMode(CENTER); // draw planet from its center
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];

    push();
    translate(p.x, p.y);
    rotate(p.rotation);
    image(p.gfx, 0, 0);  // draw pre-rendered planet

    if (p.ring) {
      noFill();
      stroke(200, 150);
      strokeWeight(2);
      ellipse(0, 0, p.size * 1.8, p.size * 1.2);
      noStroke();
    }
    pop();

    p.rotation += p.rotationSpeed;
    p.x = (p.x + p.speedX + width) % width;
    p.y = (p.y + p.speedY + height) % height;
  }
}




// ---------------------- LOADING SCREEN ---------------------- 
function drawLoadingScreen() {
  drawSpaceBackground();
  textAlign(CENTER, CENTER);
  textSize(36);
  fill(255);
  text("Loading...", width / 2, height / 2 - 50);
  const barWidth = 400, barHeight = 30;
  const barX = width / 2 - barWidth / 2;
  const barY = height / 2;
  fill(80);
  rect(barX, barY, barWidth, barHeight, 10);
  fill(135, 206, 235);
  const fillWidth = map(progress, 0, 100, 0, barWidth);
  rect(barX, barY, fillWidth, barHeight, 10);
  fill(255);
  textSize(20);
  text(`${progress.toFixed(1)}%`, width / 2, barY + barHeight + 25);
}




// ---------------------- TITLE (COMPACT) ---------------------- 
function drawTitle() {
  push();
  textAlign(CENTER, CENTER);
  textSize(40); // reduced from 48 
  const bounce = sin(frameCount * 0.05) * 8;
  const bannerHeight = 64; // reduced from 80 
  // Banner gradient stripes 
  for (let i = 0; i < bannerHeight; i++) {
    const inter = map(i, 0, bannerHeight, 0, 1);
    const c1 = color(30 + sin(frameCount * 0.02) * 30, 30, 60, 220);
    const c2 = color(60, 60 + sin(frameCount * 0.02) * 30, 90, 150);
    stroke(lerpColor(c1, c2, inter));
    line(0, i, width, i);
  }
  // Title echo/glow 
  for (let i = 6; i > 0; i--) {
    fill(135, 206, 235, 30);
    text("ASL Pacer", width / 2, 34 + bounce);
  }
  fill(0, 180);
  text("ASL Pacer", width / 2 + 3, 36 + bounce);
  fill(255);
  text("ASL Pacer", width / 2, 34 + bounce);
  // Audio visualizer overlay inside title bar (only when playing & online) 
  drawTitleAudioVisualizer();
  pop();
}




// ---------------------- BUTTONS ---------------------- 
function drawButtons() {
  buttons.forEach(btn => btn.show());
}




// ---------------------- BUTTON SETUP ---------------------- 
function setupMenuButtons() {
  buttons = [
    new Button(width / 2 - 100, height / 2 - 100, 200, 80, "Start Game", () => showGameOptions()),
    new Button(width / 2 - 100, height / 2, 200, 80, "Credits", () => showCredits())
  ];
}

function showCredits() {
  currentPage = "credits";
  buttons = [
    new Button(width / 2 - 100, height / 2, 200, 80, "Back", () => { currentPage = "menu"; setupMenuButtons(); })
  ];
}

function showGameOptions() {
  currentPage = "gameOptions";
  buttons = [
    new Button(width / 2 - 220, height / 2 - 100, 200, 80, "Singleplayer", () => { showSinglePlayerInstruc(); }),
    new Button(
      width / 2 + 20, height / 2 - 100, 200, 80, "Multiplayer",
      () => { if (!offlineMode) showMultiASLInstruc(); },
      { disabled: offlineMode, tooltip: offlineMode ? "Requires internet connection" : null }
    ),
    new Button(width / 2 - 100, height / 2, 200, 80, "Back", () => { currentPage = "menu"; setupMenuButtons(); })
  ];
}




// ---------------------- SINGLEPLAYER 
function showSinglePlayerInstruc() {
  currentPage = "singlePlayerInstruc";
  buttons = [
    new Button(width / 2 - 220, height / 2 + 70, 200, 80, "Play", () => {
      isFading = true;
      fadeAlpha = 0;
      setTimeout(() => {
        window.location.href = "/SingleplayerGame/singleplayer.html";
      }, 800);
    }),
    new Button(width / 2 + 20, height / 2 + 70, 200, 80, "Back", () => {
      currentPage = "gameOptions";
      showGameOptions();
    }),
    new Button(width / 2 - 100, height / 2 + 175, 200, 80, "Leaderboard", () => {
      currentPage = "aslLeaderboard";
      showASLLeaderboard();
    })
  ];
}

function drawSinglePlayerInstructions() {
  fill(0, 180);
  rect(width / 2 - 300, height / 2 - 200, 600, 250, 20);
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(28);
  text("\nSurvive by collecting coins. \n For each minute, you have to pay a fee. \n Failure to do so will make you lose HP.", width / 2, height / 2 - 100);
}




// ---------------------- MULTIPLAYER
function showMultiASLInstruc() {
  currentPage = "MultiASLInstruc";
  buttons = [
    new Button(width / 2 - 220, height / 2 + 70, 200, 80, "Play", () => {
      if (isOnline()) {
        isFading = true;
        fadeAlpha = 0;
        setTimeout(() => {
          window.location.href = "/MultiplayerPaceGame/multiplayerpace.html";
        }, 800);
      }
    }, { disabled: offlineMode, tooltip: offlineMode ? "Requires internet connection" : null }),
    new Button(width / 2 + 20, height / 2 + 70, 200, 80, "Back", () => {
      currentPage = "gameOptions";
      showGameOptions();
    })
  ];
}

function drawMultiASLInstructions() {
  fill(0, 180);
  rect(width / 2 - 300, height / 2 - 200, 600, 250, 20);
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(28);
  text("\nYou have 60 seconds to spell as many words\n as you can in ASL against others.\n\n Internet is required.", width / 2, height / 2 - 100);
}




// ---------------------- LEADERBOARD ---------------------- 
async function loadConfigAndInitSupabase() {
  const response = await fetch('config.json');
  const config = await response.json();
  supabaseClient = supabase.createClient(config.supabase.url, config.supabase.anonKey);
  console.log('Supabase initialized');
}

async function fetchLeaderboard() {
  const { data, error } = await supabaseClient
    .from('ASL-DataBase')
    .select('*')
    .order('Miles', { ascending: false });
  if (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
  return data;
}

function showASLLeaderboard() {
  currentPage = "aslLeaderboard";
  buttons = [
    new Button(width / 2 - 100, height / 2 + 175, 200, 80, "Back", () => { showSinglePlayerInstruc(); })
  ];
}

// === COMPACTER LEADERBOARD CARD WITH SCROLL ===
// Reduced height so bottom buttons don't overlap.
let leaderboardScrollRow = 0; // integer row offset (top visible row)
function drawASLLeaderboard() {
  // Card geometry (smaller height + slight upward offset)
  const cardW = 620;
  const cardH = 320; // reduced from 380
  const cardX = width / 2 - cardW / 2;
  const cardY = height / 2 - cardH / 2 - 10; // nudge upward for extra clearance

  // Background: subtle glass / gradient
  push();
  noStroke();
  // Outer glow
  for (let i = 0; i < 8; i++) {
    const a = map(i, 0, 7, 18, 2);
    fill(30, 60, 100, a);
    rect(cardX - i, cardY - i, cardW + i * 2, cardH + i * 2, 18);
  }
  // Inner card with gradient stripes
  for (let i = 0; i <= cardH; i++) {
    const t = i / cardH;
    const cTop = color(18, 25, 40, 210);
    const cBot = color(25, 35, 60, 180);
    stroke(lerpColor(cTop, cBot, t));
    line(cardX, cardY + i, cardX + cardW, cardY + i);
  }
  // Soft border
  noFill();
  stroke(135, 206, 235, 140);
  strokeWeight(2);
  rect(cardX, cardY, cardW, cardH, 16);
  pop();

  // Title row
  const titleY = cardY + 18;
  push();
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(24);
  text("ASL Marathon Leaderboard", width / 2, titleY);

  // Small status / subtitle
  textSize(11);
  fill(180);
  text("Ranked by miles (Words Completed)", width / 2, titleY + 18);
  pop();

  // Offline safeguard
  if (offlineMode) {
    push();
    textAlign(CENTER, CENTER);
    textSize(16);
    fill(230);
    text("Offline mode: leaderboard unavailable.", width / 2, titleY + 50);
    pop();
    return;
  }

  // Columns layout
  const tableX = cardX + 20;
  const tableY = titleY + 42;
  const tableW = cardW - 40;
  const rowH = 32;
  const headerH = 28;

  // Usable viewport height for rows
  const viewportH = cardH - (tableY - cardY) - 34; // compact bottom padding
  const visibleRows = Math.max(1, Math.floor((viewportH - headerH) / rowH));

  // Column definitions (relative widths)
  const columns = [
    { key: "rank", label: "#", w: 0.10, align: "center" },
    { key: "name", label: "Player", w: 0.44, align: "left" },
    { key: "miles", label: "Miles", w: 0.23, align: "right" },
    { key: "coins", label: "Coins", w: 0.23, align: "right" },
  ];
  const colPos = computeColumnPositions(tableX, tableW, columns);

  // Header bar
  push();
  noStroke();
  fill(0, 160);
  rect(tableX, tableY, tableW, headerH, 8);

  textAlign(LEFT, CENTER);
  textSize(12);
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const x = colPos[i].x;
    const w = colPos[i].w;
    let ta = CENTER;
    if (col.align === "left") ta = LEFT;
    if (col.align === "right") ta = RIGHT;
    textAlign(ta, CENTER);
    fill(180, 220, 255);
    text(col.label, ta === LEFT ? x + 8 : ta === RIGHT ? x + w - 8 : x + w / 2, tableY + headerH / 2);
  }
  pop();

  // Prepare sorted data
  const sortedData = [...aslLeaderboardData].sort((a, b) => b.Miles - a.Miles);
  const totalRows = sortedData.length;

  // Constrain scroll offset based on total rows
  const maxScrollRow = Math.max(0, totalRows - visibleRows);
  leaderboardScrollRow = Math.floor(constrain(leaderboardScrollRow, 0, maxScrollRow));

  // Rows (only visible slice)
  for (let i = 0; i < visibleRows && (i + leaderboardScrollRow) < totalRows; i++) {
    const dataIndex = i + leaderboardScrollRow;
    const rowY = tableY + headerH + i * rowH;

    // Zebra + highlight for top 3 (global ranks)
    push();
    noStroke();
    let baseAlpha = 108;
    let c = color(255, 255, 255, baseAlpha);
    if (i % 2 === 1) c = color(240, 240, 255, baseAlpha - 22);
    if (dataIndex === 0) c = color(255, 215, 0, 38);       // gold wash
    if (dataIndex === 1) c = color(192, 192, 192, 32);     // silver wash
    if (dataIndex === 2) c = color(205, 127, 50, 28);      // bronze wash
    fill(c);
    rect(tableX, rowY, tableW, rowH, 6);
    pop();

    // Rank medal / number (global rank)
    push();
    const rankCx = colPos[0].x + colPos[0].w / 2;
    const rankCy = rowY + rowH / 2;
    drawRankMedal(dataIndex, rankCx, rankCy);
    pop();

    // Player name
    push();
    const name = sortedData[dataIndex].PlayerName ?? "Anonymous";
    textSize(14);
    textAlign(LEFT, CENTER);
    fill(255);
    text(name, colPos[1].x + 10, rowY + rowH / 2);
    // faint shadow line
    stroke(255, 255, 255, 30);
    line(colPos[1].x, rowY + rowH, colPos[1].x + colPos[1].w, rowY + rowH);
    pop();

    // Miles
    push();
    const milesTxt = formatNumber(sortedData[dataIndex].Miles) + " mi";
    textSize(14);
    textAlign(RIGHT, CENTER);
    fill(135, 206, 235);
    text(milesTxt, colPos[2].x + colPos[2].w - 10, rowY + rowH / 2);
    pop();

    // Coins
    push();
    const coinsTxt = formatNumber(sortedData[dataIndex].Coins) + " 🪙";
    textSize(14);
    textAlign(RIGHT, CENTER);
    fill(255, 230, 140);
    text(coinsTxt, colPos[3].x + colPos[3].w - 10, rowY + rowH / 2);
    pop();
  }

  // Scrollbar (if needed)
  if (totalRows > visibleRows) {
    const trackX = tableX + tableW - 6; // skinny track near the right edge
    const trackY = tableY + headerH;
    const trackW = 4;
    const trackH = visibleRows * rowH;

    // Thumb height proportional to viewport/total
    const thumbH = Math.max(18, trackH * (visibleRows / totalRows));
    const maxThumbY = trackH - thumbH;
    const thumbY = trackY + (maxThumbY * (leaderboardScrollRow / maxScrollRow));

    push();
    noStroke();
    // track
    fill(255, 255, 255, 50);
    rect(trackX, trackY, trackW, trackH, 5);
    // thumb
    fill(135, 206, 235, 160);
    rect(trackX, thumbY, trackW, thumbH, 5);
    pop();

    // Scroll hint
    push();
    textAlign(RIGHT, CENTER);
    textSize(11);
    fill(180);
    text("Scroll to view more", tableX + tableW - 10, trackY + trackH + 8);
    pop();
  } else {
    // Footer tip when no scroll needed
    push();
    textAlign(CENTER, CENTER);
    textSize(11);
    fill(200);
    text("Data refreshes when you reconnect", width / 2, cardY + cardH - 12);
    pop();
  }
}




// --- Helpers ---
// Compute x + width for each column from relative widths.
function computeColumnPositions(x, totalW, cols) {
  const arr = [];
  let cursor = x;
  for (const col of cols) {
    const w = totalW * col.w;
    arr.push({ x: cursor, w });
    cursor += w;
  }
  return arr;
}

// Draws a medal for ranks 1-3; otherwise draws the rank number badge.
// `index` is the global rank index (0-based).
function drawRankMedal(index, cx, cy) {
  const r = 12;
  if (index === 0 || index === 1 || index === 2) {
    // Medal colors
    let fillC = color(255, 215, 0, 220);   // gold
    let ringC = color(255, 235, 150, 255);
    if (index === 1) { fillC = color(192, 192, 192, 220); ringC = color(230, 230, 230, 255); } // silver
    if (index === 2) { fillC = color(205, 127, 50, 220); ringC = color(230, 180, 130, 255); } // bronze
    push();
    noStroke();
    fill(ringC);
    ellipse(cx, cy, r * 2.0, r * 2.0);
    fill(fillC);
    ellipse(cx, cy, r * 1.5, r * 1.5);
    // Star glyph
    fill(30);
    textAlign(CENTER, CENTER);
    textSize(12);
    text("★", cx, cy);
    pop();
  } else {
    // Number badge
    push();
    noStroke();
    fill(255, 255, 255, 210);
    ellipse(cx, cy, r * 1.7, r * 1.7);
    fill(30);
    textAlign(CENTER, CENTER);
    textSize(12);
    text(index + 1, cx, cy);
    pop();
  }
}

// Format large numbers with grouping: 12500 -> "12,500"
function formatNumber(n) {
  const num = Number(n ?? 0);
  return num.toLocaleString
    ? num.toLocaleString()
    : String(num);
}




// ---------------------- UTILITIES ---------------------- 
function drawOnlineStatus() {
  const online = isOnline();
  let boxWidth = 150;
  let boxHeight = 40;
  let x = 20;
  let y = height - boxHeight - 20;
  fill(0, 180);
  rect(x, y, boxWidth, boxHeight, 10);
  let status = online ? "Online ✅" : "Offline ❌";
  fill(255);
  textSize(24);
  text(status, x + boxWidth / 2, y + boxHeight / 2);
  return online;
}

function drawOfflineBanner() {
  const w = 260, h = 28;
  const x = width - w - 20;
  const y = 20;
  fill(0, 180);
  rect(x, y, w, h, 8);
  fill(255, 220, 120);
  textAlign(CENTER, CENTER);
  textSize(14);
  text("Offline Mode – features limited", x + w / 2, y + h / 2);
}

function parseYouTubeVideoId(url) {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.split('/').filter(Boolean)[0] ?? null;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.searchParams.has('v')) return u.searchParams.get('v');
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' || parts[0] === 'shorts') return parts[1] ?? null;
    }
    return null;
  } catch {
    const m = url.match(/(?:v=\|\/embed\/\|youtu\.be\/\|\/shorts\/)([A-Za-z0-9_\-]{6,})/);
    return m ? m[1] : null;
  }
}

function showMusicUrlControls() {
  if (offlineMode) return; // safeguard: do not create/show controls when offline 
  if (!ytUrlInput) {
    ytUrlInput = createInput('');
    ytUrlInput.attribute('placeholder', 'YouTube URL');
    ytUrlInput.style('margin-left', '16em');
    ytUrlInput.style('width', '100px');
    ytUrlInput.style('padding', '10px');
    ytUrlInput.style('border-radius', '8px');
    ytUrlInput.style('border', '1px solid #8ab6ff');
    ytUrlInput.style('font-size', '16px');
  }
  if (!ytUrlLoadBtn) {
    ytUrlLoadBtn = createButton('Load Music');
    ytUrlLoadBtn.style('margin-left', '3px');
    ytUrlLoadBtn.style('padding', '0.1em 2em');
    ytUrlLoadBtn.style('border-radius', '8px');
    ytUrlLoadBtn.style('background', '#1d4ed8');
    ytUrlLoadBtn.style('color', '#fff');
    ytUrlLoadBtn.style('border', 'none');
    ytUrlLoadBtn.style('font-size', '16px');
    ytUrlLoadBtn.style('cursor', 'pointer');
    ytUrlLoadBtn.mousePressed(() => {
      if (offlineMode) return; // extra safeguard 
      const raw = ytUrlInput.value();
      const id = parseYouTubeVideoId(raw);
      if (!id) {
        ytUrlLoadBtn.html('Invalid URL');
        setTimeout(() => ytUrlLoadBtn.html('Load Music'), 2000);
        return;
      }
      if (window.bgMusic?.cue) {
        window.bgMusic.cue(id);
        window.bgMusic.setLoopEnabled(true);
        if (window.bgMusic.setMuted) window.bgMusic.setMuted(true);
        if (window.bgMusic.setVolume) window.bgMusic.setVolume(0);
        ytUrlLoadBtn.html('Music Loaded!');
        setTimeout(() => ytUrlLoadBtn.html('Load Music'), 2500);
      } else {
        ytUrlLoadBtn.html('Music Error!');
        setTimeout(() => ytUrlLoadBtn.html('Load Music'), 2000);
      }
    });
  }
  // Position bottom-right 
  const marginRight = 20;
  const marginBottom = 4;
  const inputW = 360;
  const btnW = 120;
  const spacing = 20;
  const inputX = width - marginRight - (inputW + btnW + spacing);
  const inputY = height - marginBottom - 44;
  ytUrlInput.position(inputX, inputY);
  ytUrlLoadBtn.position(inputX + inputW + spacing, inputY);
  ytUrlInput.show();
  ytUrlLoadBtn.show();
}

function destroyMusicUrlControls() {
  if (ytUrlInput) ytUrlInput.hide();
  if (ytUrlLoadBtn) ytUrlLoadBtn.hide();
}

function drawMusicHUD() {
  if (offlineMode) return; // safeguard: do not draw HUD when offline 
  const ready = bgMusic && bgMusic.ready;
  const p = musicUI;
  p.x = width - p.panelW - p.padding;
  p.y = height - p.panelH - p.padding;

  // Play 
  p.playRect.x = p.x + 105;
  p.playRect.y = p.y - 15;
  p.playRect.w = p.btnSize;
  p.playRect.h = p.btnSize;
  // Mute 
  p.muteRect.x = p.x + 95 + p.btnSize + 16;
  p.muteRect.y = p.y - 15;
  p.muteRect.w = p.btnSize;
  p.muteRect.h = p.btnSize;
  fill(ready ? color(255, 255, 255, 220) : color(180, 180, 180, 160));
  rect(p.playRect.x, p.playRect.y, p.playRect.w, p.playRect.h, 8);
  rect(p.muteRect.x, p.muteRect.y, p.muteRect.w, p.muteRect.h, 8);
  fill(0);
  textAlign(CENTER, CENTER);
  textSize(20);
  const playLabel = (!bgMusic || bgMusic.isPaused()) ? "▶" : "⏸";
  const muteLabel = (!bgMusic || bgMusic.isMuted()) ? "🔇" : "🔊";
  text(playLabel, p.playRect.x + p.playRect.w / 2, p.playRect.y + p.playRect.h / 2);
  text(muteLabel, p.muteRect.x + p.muteRect.w / 2, p.muteRect.y + p.muteRect.h / 2);
  if (!ready) {
    textSize(12);
    fill(220);
    textAlign(LEFT, BASELINE);
    text("loading…", p.x + 12, p.y + p.panelH - 12);
  }
}

function pointInRect(px, py, r) {
  return (px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h);
}

function tryToggleMusicAt(px, py) {
  if (offlineMode) return; // safeguard: block interactions when offline 
  if (!bgMusic || !bgMusic.ready) return;
  const p = musicUI;
  // Play/Pause 
  if (pointInRect(px, py, p.playRect)) {
    if (bgMusic.isPaused()) {
      if (bgMusic.setMuted) bgMusic.setMuted(true);
      if (bgMusic.setVolume) bgMusic.setVolume(0);
      bgMusic.play();
    } else {
      bgMusic.pause();
    }
    // Ensure visualizer state is updated after toggle 
    updateVisualizerState();
    return;
  }
  // Mute/Unmute 
  if (pointInRect(px, py, p.muteRect)) {
    const willMute = !bgMusic.isMuted();
    bgMusic.setMuted(willMute);
    if (bgMusic.setVolume) bgMusic.setVolume(willMute ? 0 : 100);
  }
}




// ---------------------- MOUSE CLICK / WHEEL ---------------------- 
function mousePressed() {
  // Music HUD toggles (skip in offline mode) 
  if (!offlineMode) {
    tryToggleMusicAt(mouseX, mouseY);
  }
  // Button clicks 
  for (let btn of getVisibleButtons()) {
    if (btn.isHovered()) {
      btn.click();
      return;
    }
  }
}

// p5.js wheel handler: positive deltaY means scroll down
function mouseWheel(event) {
  if (currentPage !== "aslLeaderboard" || offlineMode) return;
  // Each wheel tick scrolls roughly 1 row (tune factor as needed)
  const step = event.deltaY > 0 ? 1 : -1;
  leaderboardScrollRow += step;
  // Constrain immediately; drawASLLeaderboard also constrains based on data length
  leaderboardScrollRow = Math.max(0, leaderboardScrollRow);
  // Prevent the page from also scrolling the browser window
  return false;
}