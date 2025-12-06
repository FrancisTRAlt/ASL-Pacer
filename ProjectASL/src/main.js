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




// ---------------- SETUP ----------------
async function setup() {
  createCanvas(800, 600);
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