// Video and hand tracking
let video, handPose, hands = [];
// UI elements and state
let buttons = [];
let currentPage = "cameraCheck";
const backgroundColor = "#0066dbff";
// Gesture interaction state
let lastPinch = false;
let lastPinchTime = 0;
const pinchCooldown = 1000;
const fingers = {
  thumb: ["thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip"],
  index: ["index_finger_mcp", "index_finger_pip", "index_finger_dip", "index_finger_tip"],
  middle: ["middle_finger_mcp", "middle_finger_pip", "middle_finger_dip", "middle_finger_tip"],
  ring: ["ring_finger_mcp", "ring_finger_pip", "ring_finger_dip", "ring_finger_tip"],
  pinky: ["pinky_finger_mcp", "pinky_finger_pip", "pinky_finger_dip", "pinky_finger_tip"]
};
// Cursor animation properties
let cursorRotation = 0;
let cursorScale = 1;
let bounceOffset = 0;
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




// ---------------- SETUP ----------------
async function setup() {
  createCanvas(800, 600);
  bgMusic = window.bgMusic || null;
  // Setup leeaderboard
  await loadConfigAndInitSupabase();
  aslLeaderboardData = await fetchLeaderboard();

  // Start loading
  isLoading = true;
  progress = 0;
  targetProgress = 0;
  currentPage = "loading";

  // Create video for hand gesture
  video = createCapture(VIDEO, { flipped: true });
  video.size(800, 600);
  video.hide();

  // Loading Screen
  // Wait for video metadata
  await new Promise(resolve => {
    video.elt.onloadedmetadata = () => {
      targetProgress = 50; // Animate toward 50%
      resolve();
    };
  });
  // Initialize handPose and wait for model load
  await new Promise(resolve => {
    handPose = ml5.handPose({ flipped: true }, () => {
      targetProgress = 100; // Animate toward 100%
      resolve();
    });
  });

  // Start detection for handpose
  handPose.detectStart(video, results => {
    hands = results;
  });

  // After loading finishes, switch to menu
  currentPage = "menu";
  setupMenuButtons();
}



// ---------------- DRAW ----------------
function draw() {
  // Loading Screen
  if (isLoading && currentPage !== "cameraCheck") {
    // Smooth progress animation
    progress = lerp(progress, targetProgress, 0.05);
    // Show loading screen
    drawLoadingScreen();
    // When progress reaches ~100, finish loading
    if (progress >= 99) {
      progress = 100;
      isLoading = false;
    }
    return; // Stop here until loading is done
  }

  // If anywhere but not in the camercheck state
  if (currentPage !== "cameraCheck") {
    drawSpaceBackground();
    drawTitle();

    if (hands.length > 0) { // Hand detection
      userIsOnline();
      drawButtons();
    } else {
      textAlign(CENTER, CENTER);
      textSize(36);
      fill(255);
      text("No Hand Detected", width / 2, height / 2);
      text("Raise your Hand to Use the Menu", width / 2, height / 2 + 50);
    }
  }

  // Hand detection (Note that we start from the menu. If we click "Start Game", show these options)
  if (hands.length > 0) {
    if (currentPage === "singlePlayerInstruc") { // ASL Survival
      drawSinglePlayerInstructions();
    } else if (currentPage === "MultiASLInstruc") { // ASL Pacer (Multiplayer)
      drawMultiASLInstructions();
    } else if (currentPage === "aslLeaderboard") { // Leaderboard in the ASL survival
      drawASLLeaderboard();
    } else if (currentPage === "credits") { // Credits
      fill(0);
      rect(width / 4, height / 4 - 50, width / 2, 170, 20);

      // Title
      textSize(48);
      fill("SkyBlue");
      text("Credits", width / 2, height / 4);

      // Credits List
      textSize(28);
      fill("SkyBlue");
      text("Developed by: Francis Tran", width / 2, height / 2 - 80);

      // Footer
      textSize(20);
      fill(180);
      text("© 2025 ASL Pacer Project", width / 2, height - 70);
    }
  }

  // Show the hand and its pinch function
  if (hands.length > 0) handleHandInteraction(0, 0, video.width, video.height);
  if (hands.length > 0) drawHandSkeleton(hands[0], fingers);

  // DRAW MUSIC HUD
  if (!bgMusic && window.bgMusic) bgMusic = window.bgMusic; // late-binding
  drawMusicHUD();

  // Fade transition to a different page
  if (isFading) {
    fadeAlpha = min(fadeAlpha + 10, 255);
    fill(0, fadeAlpha);
    rect(0, 0, width, height);
  }
}



// ---------------- MENU BACKGROUND ----------------
function drawSpaceBackground() {
  background(0); // Black space
  noStroke();
  // Create stars once and store them in a static variable
  if (!drawSpaceBackground.stars) {
    drawSpaceBackground.stars = [];
    const numStars = 200;
    for (let i = 0; i < numStars; i++) {
      drawSpaceBackground.stars.push({
        x: random(width),
        y: random(height),
        size: random(1, 3),
        phase: random(TWO_PI)
      });
    }
  }

  // Draw stars with smooth twinkle
  for (let s of drawSpaceBackground.stars) {
    let alpha = map(sin(frameCount * 0.02 + s.phase), -1, 1, 100, 255);
    fill(255, alpha);
    ellipse(s.x, s.y, s.size, s.size);
  }
}



// ---------------- LOADING SCREEN ----------------
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



// ---------------- TITLE ----------------
function drawTitle() {
  push();
  textAlign(CENTER, CENTER);
  textSize(48);
  const bounce = sin(frameCount * 0.05) * 10;
  const bannerHeight = 80;
  for (let i = 0; i < bannerHeight; i++) {
    const inter = map(i, 0, bannerHeight, 0, 1);
    const c1 = color(30 + sin(frameCount * 0.02) * 30, 30, 60, 220);
    const c2 = color(60, 60 + sin(frameCount * 0.02) * 30, 90, 150);
    stroke(lerpColor(c1, c2, inter));
    line(0, i, width, i);
  }
  for (let i = 8; i > 0; i--) {
    fill(135, 206, 235, 30);
    text("ASL Pacer", width / 2, 40 + bounce);
  }
  fill(0, 180);
  text("ASL Pacer", width / 2 + 3, 43 + bounce);
  fill(255);
  text("ASL Pacer", width / 2, 40 + bounce);
  pop();
}



// ---------------- BUTTONS ----------------
function createButtonObj(label, x, y, w, h, action) {
  return { label, x, y, w, h, hidden: false, action };
}

function drawButtons() { // Draw ALL buttons based on it is visible status
  buttons.forEach(btn => {
    if (!btn.hidden) drawButton(btn);
  });
}

function drawButton(btn) { // Button blueprint
  fill(0, 150);
  rect(btn.x, btn.y, btn.w, btn.h, 10);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(24);
  text(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
}

function highlightButton(btn) { // When the button is highlighted
  fill(255, 255, 0);
  rect(btn.x, btn.y, btn.w, btn.h, 10);
  fill(0);
  textAlign(CENTER, CENTER);
  textSize(24);
  text(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
}

// ---------------- BUTTON SETUP IN RESPECTIVE PLACE ----------------
// ---------------- MENU
function setupMenuButtons() {
  showMusicUrlControls();
  buttons = [
    createButtonObj("Start Game", width / 2 - 100, height / 2 - 100, 200, 80, () => showGameOptions()),
    createButtonObj("Credits", width / 2 - 100, height / 2, 200, 80, () => showCredits())
  ];
}

function showCredits() {
  currentPage = "credits";
  buttons = [
    createButtonObj("Back", width / 2 - 100, height / 2, 200, 80, () => { currentPage = "menu"; setupMenuButtons(); })
  ];
}


// ---------------- MENU (After Start Game)
function showGameOptions() {
  currentPage = "gameOptions";
  buttons = [
    createButtonObj("Singleplayer", width / 2 - 220, height / 2 - 100, 200, 80, () => { showSinglePlayerInstruc(); }),
    createButtonObj("Multiplayer", width / 2 + 20, height / 2 - 100, 200, 80, () => { showMultiASLInstruc(); }),
    createButtonObj("Back", width / 2 - 100, height / 2, 200, 80, () => { currentPage = "menu"; setupMenuButtons(); })
  ];
}


// ---------------- SINGLEPLAYER (ASL Survival)
function showSinglePlayerInstruc() { // Buttons shown
  currentPage = "singlePlayerInstruc";
  buttons = [
    createButtonObj("Play", width / 2 - 220, height / 2 + 70, 200, 80, () => {
      isFading = true;
      fadeAlpha = 0;
      setTimeout(() => {
        window.location.href = "/SingleplayerGame/singleplayer.html";
      }, 800);
    }),
    createButtonObj("Back", width / 2 + 20, height / 2 + 70, 200, 80, () => {
      currentPage = "gameOptions";
      showGameOptions();
    }),
    createButtonObj("Leaderboard", width / 2 - 100, height / 2 + 175, 200, 80, () => {
      currentPage = "aslLeaderboard";
      showASLLeaderboard();
    })
  ];
}

function drawSinglePlayerInstructions() { //Instruction shown
  fill(0, 180);
  rect(width / 2 - 300, height / 2 - 200, 600, 250, 20);
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(28);
  text("\nSurvive by collecting coins. \n\n For each minute, you have to pay a fee. \n\n Failure to do so will make you lose HP.", width / 2, height / 2 - 100);
  drawButtons();
}


// ---------------- MULTIPLAYER (ASL Pacer)
function showMultiASLInstruc() { // Button shown
  currentPage = "MultiASLInstruc";
  buttons = [
    createButtonObj("Play", width / 2 - 220, height / 2 + 70, 200, 80, () => {
      if (userIsOnline()) {
        isFading = true;
        fadeAlpha = 0;
        setTimeout(() => {
          window.location.href = "/MultiplayerPaceGame/multiplayerpace.html";
        }, 800);
      }
    }),
    createButtonObj("Back", width / 2 + 20, height / 2 + 70, 200, 80, () => {
      currentPage = "gameOptions";
      showGameOptions();
    })
  ];
}

function drawMultiASLInstructions() { // Instructions shown
  fill(0, 180);
  rect(width / 2 - 300, height / 2 - 200, 600, 250, 20);
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(28);
  text("\nYou have 60 seconds to spell as many words\n as you can in ASL against others.\n\n Internet is required.", width / 2, height / 2 - 100);
  drawButtons();
}



// ---------------- LEADERBOARDS ----------------
async function loadConfigAndInitSupabase() { // Load Supabase
  const response = await fetch('config.json'); // Path to your API KEYS
  const config = await response.json();

  supabaseClient = supabase.createClient(config.supabase.url, config.supabase.anonKey);

  console.log('Supabase initialized');
}

async function fetchLeaderboard() { // Query the Leaderboard
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

function showASLLeaderboard() { // Show the buttons in the leaderboard page
  currentPage = "aslLeaderboard";
  buttons = [
    createButtonObj("Back", width / 2 - 100, height - 100, 200, 60, () => { showSinglePlayerInstruc(); })
  ];
}

function drawASLLeaderboard() { // Show the data of the leaderboard
  fill(0, 180);
  rect(width / 2 - 300, height / 2 - 220, 600, 410, 20);
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(36);
  text("ASL Marathon Leaderboard", width / 2, height / 2 - 180);

  textSize(15);
  let startY = height / 2 - 140;

  // Sort by Miles
  const sortedData = [...aslLeaderboardData].sort((a, b) => b.Miles - a.Miles).slice(0, 10); // Sort from top to bottom
  sortedData.forEach((player, index) => {
    if (index === 0) {
      let pulse = map(sin(frameCount * 0.1), -1, 1, 180, 255);
      fill(pulse, pulse * 0.84, 0);
    } else {
      fill(255);
    }

    // Display PlayerName, Miles, and Coins
    text(
      `${index + 1}. ${player.PlayerName} - ${player.Miles} miles | ${player.Coins} coins`,
      width / 2,
      startY + index * 35
    );
  });
}



// ---------------- UTILITIES ----------------
async function checkCameraAccess() { // See if the camera is on
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (err) {
    console.error("Camera access denied or unavailable:", err);
    return false;
  }
}

function userIsOnline() { // Is the user connected to the internet?
  let boxWidth = 150;
  let boxHeight = 40;
  let x = 20;
  let y = height - boxHeight - 20;
  fill(0, 180);
  rect(x, y, boxWidth, boxHeight, 10);
  let status = navigator.onLine ? "Online ✅" : "Offline ❌";
  fill(255);
  textSize(24); // <-- Add this to keep it consistent
  text(status, x + boxWidth / 2, y + boxHeight / 2);
  return navigator.onLine;
}



// ---------------- HAND INTERACTION ----------------
function handleHandInteraction(sx, sy, sw, sh) {
  // Get the first detected hand
  const hand = hands[0];

  // Extract key fingertip positions
  const index = hand.index_finger_tip;
  const thumb = hand.thumb_tip;

  // Clamp helper to keep values within canvas bounds
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  // Map original hand coordinates to canvas coordinates
  const mapX = origX => clamp(((origX - sx) / sw) * width, 0, width);
  const mapY = origY => clamp(((origY - sy) / sh) * height, 0, height);

  // Convert fingertip positions to canvas space
  const indexX = mapX(index.x), indexY = mapY(index.y);
  const thumbX = mapX(thumb.x), thumbY = mapY(thumb.y);

  // Calculate distance between index and thumb (pinch detection)
  const d = dist(indexX, indexY, thumbX, thumbY);

  // Cursor position is midpoint between thumb and index
  const x = (indexX + thumbX) / 2, y = (indexY + thumbY) / 2;

  // Define pinch threshold based on canvas width
  const pinchThreshold = width * 0.036;
  const isPinching = d < pinchThreshold;

  // Check if cursor is hovering over any button
  let isHoveringButton = false;
  buttons.forEach(btn => {
    if (!btn.hidden && x > btn.x && x < btn.x + btn.w && y > btn.y && y < btn.y + btn.h) {
      isHoveringButton = true;
    }
  });

  // Animate cursor properties based on pinch state
  cursorRotation = lerp(cursorRotation, isPinching ? 15 : 0, 0.1);
  cursorScale = lerp(cursorScale, isPinching ? 1.5 : 1.2, 0.1);
  bounceOffset = isPinching ? sin(frameCount * 0.3) * 4 : 0;

  // Cursor color changes based on interaction state
  let cursorColor = isPinching ? color('cyan') : isHoveringButton ? color(0) : color(255);

  // Draw custom cursor at calculated position
  push();
  translate(x, y + bounceOffset);
  rotate(radians(cursorRotation));
  scale(cursorScale);
  noStroke();
  fill(cursorColor);
  rectMode(CENTER);
  circle(0, 0, 25);
  pop();

  // Highlight button and trigger action if pinched
  buttons.forEach(btn => {
    if (!btn.hidden && x > btn.x && x < btn.x + btn.w && y > btn.y && y < btn.y + btn.h) {
      highlightButton(btn);
      if (isPinching && millis() - lastPinchTime > pinchCooldown) {
        btn.action();
        lastPinchTime = millis();
      }
    }
  });

  // Update pinch state for next frame
  lastPinch = isPinching;
}

function drawHandSkeleton(hand, fingers) {
  // Helper to safely fetch a point and map it to canvas coords
  const mapPt = (name) => {
    const pt = hand[name];
    if (!pt) return null;
    const x = map(pt.x, 0, video.width, 0, width);
    const y = map(pt.y, 0, video.height, 0, height);
    return { x, y };
  };

  // Draw all visible keypoints
  for (const name in hand) {
    const p = mapPt(name);
    if (!p) continue;
    noStroke();
    fill('cyan');
    ellipse(p.x, p.y, 12, 12);
  }

  // Draw fingers (mcp → pip → dip → tip)
  stroke(255);
  strokeWeight(2);
  for (const finger in fingers) {
    const chain = fingers[finger]
      .map(mapPt)
      .filter(Boolean); // drop missing points
    for (let i = 0; i < chain.length - 1; i++) {
      line(chain[i].x, chain[i].y, chain[i + 1].x, chain[i + 1].y);
    }
  }

  // Draw palm: chain MCPs and connect wrist to MCPs
  const palmChainNames = [
    "thumb_cmc",
    "index_finger_mcp",
    "middle_finger_mcp",
    "ring_finger_mcp",
    "pinky_finger_mcp",
  ];
  const palmChain = palmChainNames.map(mapPt).filter(Boolean);
  for (let i = 0; i < palmChain.length - 1; i++) {
    line(palmChain[i].x, palmChain[i].y, palmChain[i + 1].x, palmChain[i + 1].y);
  }

  const wrist = mapPt("wrist");
  if (wrist) {
    for (const mcpName of [
      "index_finger_mcp",
      "middle_finger_mcp",
      "ring_finger_mcp",
      "pinky_finger_mcp",
      "thumb_cmc"
    ]) {
      const mcp = mapPt(mcpName);
      if (mcp) line(wrist.x, wrist.y, mcp.x, mcp.y);
    }
  }
}





function parseYouTubeVideoId(url) {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, '');
    // youtu.be/<id>
    if (host === 'youtu.be') return u.pathname.split('/').filter(Boolean)[0] || null;
    // youtube.com/watch?v=<id>
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.searchParams.has('v')) return u.searchParams.get('v');
      // /embed/<id> or /shorts/<id>
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' || parts[0] === 'shorts') return parts[1] || null;
    }
    return null;
  } catch {
    // Fallback regex for typical paste cases
    const m = url.match(/(?:v=|\/embed\/|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
  }
}

function showMusicUrlControls() {
  // Create once
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
      const raw = ytUrlInput.value();
      const id = parseYouTubeVideoId(raw);
      if (!id) {
        ytUrlLoadBtn.html('Invalid URL');
        setTimeout(() => ytUrlLoadBtn.html('Load Music'), 2000);
        return;
      }
      if (window.bgMusic?.cue) {
        window.bgMusic.cue(id);            // cue only (no play)
        window.bgMusic.setLoopEnabled(true);
        
        // IMPORTANT: ensure the new video is muted immediately after cueing
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

  // === RIGHT-SIDE POSITIONING (bottom-right) ===
  const marginRight = 20;   // distance from right edge of the canvas
  const marginBottom = 4;  // distance from bottom edge of the canvas

  // Start with the input aligned to the right edge
  const inputW = 360;
  const btnW = 120;       // visual width of button (approx)
  const spacing = 20;

  // Compute x so the input sits flush to the right margin
  const inputX = width - marginRight - (inputW + btnW + spacing);
  const inputY = height - marginBottom - 44; // 44 ≈ input height + a little padding

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
  // Show a disabled panel until the API is ready
  const ready = bgMusic && bgMusic.ready;

  const p = musicUI;
  p.x = width - p.panelW - p.padding;
  p.y = height - p.panelH - p.padding;

  // Panel
  noStroke();
  fill(0, 180);
  rect(p.x, p.y, p.panelW, p.panelH, 12);

  // Compute button rects
  //Play
  p.playRect.x = p.x + 105;
  p.playRect.y = p.y - 15;

  p.playRect.w = p.btnSize;
  p.playRect.h = p.btnSize;

  //Mute
  p.muteRect.x = p.x + 95 + p.btnSize + 16;
  p.muteRect.y = p.y - 15;
  p.muteRect.w = p.btnSize;
  p.muteRect.h = p.btnSize;

  // Button backgrounds
  fill(ready ? color(255, 255, 255, 220) : color(180, 180, 180, 160));
  rect(p.playRect.x, p.playRect.y, p.playRect.w, p.playRect.h, 8);
  rect(p.muteRect.x, p.muteRect.y, p.muteRect.w, p.muteRect.h, 8);

  // Button labels
  fill(0);
  textAlign(CENTER, CENTER);
  textSize(20);
  const playLabel = (!bgMusic || bgMusic.isPaused()) ? "▶" : "⏸";
  const muteLabel = (!bgMusic || bgMusic.isMuted()) ? "🔇" : "🔊";
  text(playLabel, p.playRect.x + p.playRect.w / 2, p.playRect.y + p.playRect.h / 2);
  text(muteLabel, p.muteRect.x + p.muteRect.w / 2, p.muteRect.y + p.muteRect.h / 2);

  // Hint when not ready
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
  if (!bgMusic || !bgMusic.ready) return;
  const p = musicUI;

  // Play/Pause button
  if (pointInRect(px, py, p.playRect)) {
    if (bgMusic.isPaused()) {
      // IMPORTANT: ensure silence before starting playback
      if (bgMusic.setMuted) bgMusic.setMuted(true);
      if (bgMusic.setVolume) bgMusic.setVolume(0); // in case your facade supports volume
      bgMusic.play();
    } else {
      bgMusic.pause();
    }
    return;
  }

  // Mute/Unmute button
  if (pointInRect(px, py, p.muteRect)) {
    const willMute = !bgMusic.isMuted();
    bgMusic.setMuted(willMute);
    if (bgMusic.setVolume) bgMusic.setVolume(willMute ? 0 : 100);
  }
}

function mousePressed() {
  tryToggleMusicAt(mouseX, mouseY);
}