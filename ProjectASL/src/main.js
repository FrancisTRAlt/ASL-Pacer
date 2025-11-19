// Video and hand tracking
let video, handPose, hands = [];
// UI elements and state
let buttons = [];
let currentPage = "cameraCheck";
// Gesture interaction state
let lastPinch = false;
let lastPinchTime = 0;
const pinchCooldown = 1000;
// Cursor animation properties
let cursorRotation = 0;
let cursorScale = 1;
let bounceOffset = 0;
// Loading screen state
let isLoading = true;
let progress = 0;
// Fade transition state
let isFading = false;
let fadeAlpha = 0;

// Dummy leaderboard data
let aslLeaderboardData = [
  { name: "PlayerOne", score: 120 },
  { name: "PlayerTwo", score: 95 },
  { name: "PlayerThree", score: 80 },
  { name: "PlayerFour", score: 70 },
  { name: "PlayerFive", score: 60 },
  { name: "PlayerSix", score: 55 },
  { name: "PlayerSeven", score: 50 },
  { name: "PlayerEight", score: 45 },
  { name: "PlayerNine", score: 40 },
  { name: "PlayerTen", score: 35 },
  { name: "PlayerEleven", score: 30 }
];

let arduinoLeaderboardData = [
  { name: "MakerMax", score: 150 },
  { name: "CodeGuru", score: 110 },
  { name: "TechieTom", score: 90 },
  { name: "CircuitQueen", score: 85 },
  { name: "ByteBoss", score: 75 },
  { name: "HackHero", score: 70 },
  { name: "WireWizard", score: 65 },
  { name: "ChipChamp", score: 60 },
  { name: "BoardBoss", score: 55 },
  { name: "ElectroAce", score: 50 },
  { name: "VoltViking", score: 45 }
];

// Sort function
function sortLeaderboard(data) {
  return data.sort((a, b) => b.score - a.score);
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
    retryButton = createButton("Retry");
    retryButton.position(width / 2 - 75, height / 2 + 40);
    retryButton.size(150, 50);
    retryButton.mousePressed(async () => {
      const retry = await checkCameraAccess();
      if (retry) {
        retryButton.remove();
        window.reload();
      }
    });
    noLoop();
    return;
  }
  noCursor();
  currentPage = "menu";

  video = createCapture(VIDEO, { flipped: true });
  video.size(800, 600);
  video.hide();

  handPose.detectStart(video, results => {
    hands = results;
    if (isLoading && hands.length > 0) {
      isLoading = false;
    }
  });

  setupMenuButtons();

  let progressInterval = setInterval(() => {
    if (progress < 100) progress += 2;
    if (progress >= 100) {
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
    userIsOnline();
    drawButtons();
  }

  if (currentPage === "singlePlayerInstruc") {
    drawSinglePlayerInstructions();
  }else if (currentPage === "multiplayerOptions"){
    showMultiplayerOptions();
  }else if (currentPage === "MultiASLInstruc"){
    drawMultiASLInstructions();
  }else if (currentPage === "MultiArduinoInstruc"){
    drawMultiArduinoInstructions();
  }else if (currentPage === "aslLeaderboard") {
    drawASLLeaderboard();
  } else if (currentPage === "arduinoLeaderboard") {
    drawArduinoLeaderboard();
  }else if (currentPage === "credits") {
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

  if (hands.length > 0) handleHandInteraction(0, 0, video.width, video.height);

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
// ---------------- MENU ----------------
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


// ---------------- MENU Part 2 ----------------
function showGameOptions() {
  currentPage = "gameOptions";
  buttons = [
    createButtonObj("Single Player", width / 2 - 220, height / 2 - 100, 200, 80, () => { showSinglePlayerInstruc(); }),
    createButtonObj("Multiplayer", width / 2 + 20, height / 2 - 100, 200, 80, () => { showMultiplayerOptions(); }),
    createButtonObj("Back", width / 2 - 100, height / 2, 200, 80, () => { currentPage = "menu"; setupMenuButtons(); })
  ];
}


// ---------------- SINGLEPLAYER ----------------
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

function drawSinglePlayerInstructions() {
  fill(0, 180);
  rect(width / 2 - 300, height / 2 - 200, 600, 250, 20);
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(28);
  text("\nYou have 60 seconds to spell as many words\n as you can in ASL.\n\nMake sure you are in a\ngood distance from the camera.", width / 2, height / 2 - 100);
  drawButtons();
}

// ---------------- MULTIPLAYER MENU ----------------
function showMultiplayerOptions() {
  currentPage = "multiplayerOptions";
  const leftX = width / 2 - 250;
  const rightX = width / 2 + 50;
  const topY = height / 2 - 120;
  const bottomY = height / 2 + 20;

  buttons = [
    createButtonObj("ASL Marathon", leftX, topY, 200, 100, () => { showMultiASLInstruc(); }),
    createButtonObj("Arduino Coder", rightX, topY, 200, 100, () => { showMultiArduinoInstruc(); }),
    createButtonObj("Leaderboard", leftX, bottomY, 200, 70, () => { showASLLeaderboard(); }),
    createButtonObj("Leaderboard", rightX, bottomY, 200, 70, () => { showArduinoLeaderboard(); }),
    createButtonObj("Back", width / 2 - 100, height - 170, 200, 60, () => { currentPage = "gameOptions"; showGameOptions(); })
  ];
}
// ---------------- MULTIPLAYER ASL Marathon MENU ----------------
function showMultiASLInstruc() {
  currentPage = "MultiASLInstruc";
  buttons = [
    createButtonObj("Play", width / 2 - 220, height / 2 + 70, 200, 80, () => {
      isFading = true;
      fadeAlpha = 0;
      setTimeout(() => {
        window.location.href = "/MultiplayerPaceGame/multiplayerpace.html";
      }, 800);
    }),
    createButtonObj("Back", width / 2 + 20, height / 2 + 70, 200, 80, () => {
      currentPage = "multiplayerOptions";
      showMultiplayerOptions();
    })
  ];
}
function drawMultiASLInstructions() {
  fill(0, 180);
  rect(width / 2 - 300, height / 2 - 200, 600, 250, 20);
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(28);
  text("\nYou have 60 seconds to spell as many words\n as you can in ASL.\n\nMake sure you are in a\ngood distance from the camera.\nHave fun racing!", width / 2, height / 2 - 100);
  drawButtons();
}

// ---------------- MULTIPLAYER Arduino MENU ----------------
function showMultiArduinoInstruc() {
  currentPage = "MultiArduinoInstruc";
  buttons = [
    createButtonObj("Play", width / 2 - 220, height / 2 + 70, 200, 80, () => {
      isFading = true;
      fadeAlpha = 0;
      setTimeout(() => {
        window.location.href = "???";
      }, 800);
    }),
    createButtonObj("Back", width / 2 + 20, height / 2 + 70, 200, 80, () => {
      currentPage = "multiplayerOptions";
      showMultiplayerOptions();
    })
  ];
}
function drawMultiArduinoInstructions() {
  fill(0, 180);
  rect(width / 2 - 300, height / 2 - 200, 600, 250, 20);
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(28);
  text("\nTO BE DECIDED.", width / 2, height / 2 - 100);
  drawButtons();
}


// ---------------- LEADERBOARDS ----------------
function showASLLeaderboard() {
  currentPage = "aslLeaderboard";
  buttons = [
    createButtonObj("Back", width / 2 - 100, height - 100, 200, 60, () => { showMultiplayerOptions(); })
  ];
}
function showArduinoLeaderboard() {
  currentPage = "arduinoLeaderboard";
  buttons = [
    createButtonObj("Back", width / 2 - 100, height - 100, 200, 60, () => { showMultiplayerOptions(); })
  ];
}

function drawASLLeaderboard() {
  fill(0, 180);
  rect(width / 2 - 300, height / 2 - 220, 600, 410, 20);
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(36);
  text("ASL Marathon Leaderboard", width / 2, height / 2 - 180);

  textSize(15);
  let startY = height / 2 - 140;
  const sortedData = sortLeaderboard([...aslLeaderboardData]).slice(0, 10);
  sortedData.forEach((player, index) => {
    if (index === 0) {
      let pulse = map(sin(frameCount * 0.1), -1, 1, 180, 255);
      fill(pulse, pulse * 0.84, 0);
    } else {
      fill(255);
    }
    text(`${index + 1}. ${player.name} - ${player.score} pts`, width / 2, startY + index * 35);
  });
}

function drawArduinoLeaderboard() {
  fill(0, 180);
  rect(width / 2 - 300, height / 2 - 220, 600, 410, 20);
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(36);
  text("Arduino Coder Leaderboard", width / 2, height / 2 - 180);

  textSize(15);
  let startY = height / 2 - 140;
  const sortedData = sortLeaderboard([...arduinoLeaderboardData]).slice(0, 10);
  sortedData.forEach((player, index) => {
    if (index === 0) {
      let pulse = map(sin(frameCount * 0.1), -1, 1, 180, 255);
      fill(pulse, pulse * 0.84, 0);
    } else {
      fill(255);
    }
    text(`${index + 1}. ${player.name} - ${player.score} pts`, width / 2, startY + index * 35);
  });
}










// ---------------- UTILITIES ----------------
function createButtonObj(label, x, y, w, h, action) {
  return { label, x, y, w, h, hidden: false, action };
}

async function checkCameraAccess() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (err) {
    console.error("Camera access denied or unavailable:", err);
    return false;
  }
}

function userIsOnline() {
  let boxWidth = 150;
  let boxHeight = 40;
  let x = 20;
  let y = height - boxHeight - 20;
  fill(0, 180);
  rect(x, y, boxWidth, boxHeight, 10);
  let status = navigator.onLine ? "Online ✅" : "Offline ❌";
  fill(255);
  text(status, x + boxWidth / 2, y + boxHeight / 2);
  return navigator.onLine;
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
