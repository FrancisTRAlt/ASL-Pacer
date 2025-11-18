// Video and hand tracking
let video, handPose, hands = [];

// UI elements and state
let buttons = []; // Array of button objects
let currentPage = "cameraCheck"; // Tracks current page (menu/game options)

// Gesture interaction state
let lastPinch = false;
let lastPinchTime = 0;
const pinchCooldown = 1000;  // Minimum time between pinch actions (ms)

// Cursor animation properties
let cursorRotation = 0;
let cursorScale = 1;
let bounceOffset = 0;

// Loading screen state
let isLoading = true; // Indicates if loading is active
let progress = 0; // Progress bar percentage

// Fade transition state
let isFading = false;
let fadeAlpha = 0;


async function checkCameraAccess() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(track => track.stop()); // Stop after check
    return true;
  } catch (err) {
    console.error("Camera access denied or unavailable:", err);
    return false;
  }
}

// ---------------- PRELOAD ----------------
function preload() {
  handPose = ml5.handPose({ flipped: true });
}

// ---------------- SETUP ----------------
async function setup() {
  createCanvas(800, 600);

  const cameraAvailable = await checkCameraAccess();

  if (!cameraAvailable) {
    background(0);
    textAlign(CENTER, CENTER);
    textSize(28);
    fill("SkyBlue");
    text("This game requires a camera. Please enable.", width / 2, height / 2);

    // Create Retry Button
    retryButton = createButton("Retry");
    retryButton.position(width / 2 - 75, height / 2 + 40);
    retryButton.size(150, 50);
    retryButton.mousePressed(async () => {
      const retry = await checkCameraAccess();
      if (retry) {
        retryButton.remove(); // Remove button after success
        window.reload();
      }
    });

    noLoop();
    return;
  }
  noCursor();
  currentPage = "menu";
  // Setup webcam capture
  video = createCapture(VIDEO, { flipped: true });
  video.size(800, 600);
  video.hide();

  // Start hand detection
  handPose.detectStart(video, results => {
    hands = results;
    if (isLoading && hands.length > 0) {
      isLoading = false; // Stop loading when hands detected
    }
  });

  setupMenuButtons(); // Initialize menu buttons

  // Simulate loading progress until complete
  let progressInterval = setInterval(() => {
    if (progress < 100) progress += 2; // Increment progress
    if (progress >= 100 || !isLoading) { //Loading Complete
      progress = 100;
      clearInterval(progressInterval);
      isLoading = false;
    }
  }, 50);
}

// ---------------- DRAW ----------------
function draw() {
  if (isLoading && currentPage !== "cameraCheck") {
    drawLoadingScreen();
    return;
  }

  if (currentPage !== "cameraCheck") {
    drawPixelatedVideo();
    drawTitle();
  }

  if (currentPage === "singlePlayerInstruc") {
    drawInstructions();
  } else {
    drawButtons();
  }

  if (currentPage === "credits") {
    fill(0);
    rect(width / 4, height / 4 - 50, width / 2, 170, 20); // Rounded c
    
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

  // HandPose Mouse
  if (hands.length > 0) handleHandInteraction(0, 0, video.width, video.height);

  // Fading transition
  if (isFading) {
    fadeAlpha = min(fadeAlpha + 10, 255);
    fill(0, fadeAlpha);
    rect(0, 0, width, height);
  }
}

// ---------------- LOADING SCREEN ----------------
function drawLoadingScreen() {
  background(30);
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
  text(`${progress}%`, width / 2, barY + barHeight + 25);
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

// ---------------- PIXELATION EFFECT ----------------
function drawPixelatedVideo() {
  const pixelSize = 20;
  video.loadPixels();

  for (let y = 0; y < video.height; y += pixelSize) {
    for (let x = 0; x < video.width; x += pixelSize) {
      const i = (y * video.width + x) * 4;
      const r = video.pixels[i], g = video.pixels[i + 1], b = video.pixels[i + 2];

      fill(r, g, b);
      noStroke();
      rect(
        map(x, 0, video.width, 0, width),
        map(y, 0, video.height, 0, height),
        map(pixelSize, 0, video.width, 0, width),
        map(pixelSize, 0, video.height, 0, height)
      );
    }
  }
}

// ---------------- BUTTONS ----------------
function drawButtons() {
  buttons.forEach(btn => {
    if (!btn.hidden) drawButton(btn);
  });
}

function drawButton(btn) {
  fill(0, 150);
  rect(btn.x, btn.y, btn.w, btn.h, 10);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(24);
  text(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
}

function highlightButton(btn) {
  fill(255, 255, 0);
  rect(btn.x, btn.y, btn.w, btn.h, 10);
  fill(0);
  textAlign(CENTER, CENTER);
  textSize(24);
  text(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
}

// ---------------- BUTTON SETUP ----------------
function setupMenuButtons() {
  buttons = [
    createButtonObj("Start Game", width / 2 - 100, height / 2 - 100, 200, 80, () => showGameOptions()),
    createButtonObj("Credits", width / 2 - 100, height / 2, 200, 80, () => showCredits())
  ];
}

function showGameOptions() {
  currentPage = "gameOptions";
  buttons = [
    createButtonObj("Single Player", width / 2 - 220, height / 2 - 100, 200, 80, () => {
      showSinglePlayerInstruc();
    }),
    createButtonObj("Multiplayer", width / 2 + 20, height / 2 - 100, 200, 80, () => console.log("Multiplayer Selected")),
    createButtonObj("Back", width / 2 - 100, height / 2, 200, 80, () => {
      currentPage = "menu";
      setupMenuButtons();
    })
  ];
}

function showCredits() {
  currentPage = "credits";
  buttons = [
    createButtonObj("Back", width / 2 - 100, height / 2, 200, 80, () => {
      currentPage = "menu";
      setupMenuButtons();
    })
  ];
}

function showSinglePlayerInstruc() {
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
    })
  ];
}

function drawInstructions() {
  // Black background box for readability
  fill(0, 180);
  rect(width / 2 - 300, height / 2 - 200, 600, 250, 20);

  textAlign(CENTER, CENTER);
  fill(255);
  textSize(28);
  text("\nYou have 60 seconds to spell as many words\n as you can in ASL. \n\n Make sure you are in a\ngood distance from the camera.", width / 2, height / 2 - 100);
  drawButtons();
}

function createButtonObj(label, x, y, w, h, action) {
  return { label, x, y, w, h, hidden: false, action };
}

// ---------------- HAND INTERACTION ----------------
function handleHandInteraction(sx, sy, sw, sh) {
  const hand = hands[0];
  const index = hand.index_finger_tip;
  const thumb = hand.thumb_tip;

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
  const mapX = origX => clamp(((origX - sx) / sw) * width, 0, width);
  const mapY = origY => clamp(((origY - sy) / sh) * height, 0, height);

  const indexX = mapX(index.x), indexY = mapY(index.y);
  const thumbX = mapX(thumb.x), thumbY = mapY(thumb.y);

  const d = dist(indexX, indexY, thumbX, thumbY);
  const x = (indexX + thumbX) / 2, y = (indexY + thumbY) / 2;
  const pinchThreshold = width * 0.036;
  const isPinching = d < pinchThreshold;

  let isHoveringButton = false;
  buttons.forEach(btn => {
    if (!btn.hidden && x > btn.x && x < btn.x + btn.w && y > btn.y && y < btn.y + btn.h) {
      isHoveringButton = true;
    }
  });

  cursorRotation = lerp(cursorRotation, isPinching ? 15 : 0, 0.1);
  cursorScale = lerp(cursorScale, isPinching ? 1.5 : 1.2, 0.1);
  bounceOffset = isPinching ? sin(frameCount * 0.3) * 4 : 0;

  let cursorColor = isPinching ? color(135, 206, 235) : isHoveringButton ? color(255) : color(0);

  push();
  translate(x, y + bounceOffset);
  rotate(radians(cursorRotation));
  scale(cursorScale);
  noStroke();
  fill(cursorColor);
  rectMode(CENTER);
  rect(0, 0, 32, 32, 6);
  pop();

  buttons.forEach(btn => {
    if (!btn.hidden && x > btn.x && x < btn.x + btn.w && y > btn.y && y < btn.y + btn.h) {
      highlightButton(btn);
      if (isPinching && millis() - lastPinchTime > pinchCooldown) {
        btn.action();
        lastPinchTime = millis();
      }
    }
  });

  lastPinch = isPinching;
}