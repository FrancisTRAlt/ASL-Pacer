let video, handPose, hands = [];
let img;
let buttons = [];
let currentPage = "menu"; // Tracks active page
let lastPinch = false;

function preload() {
  handPose = ml5.handPose({ flipped: true });
  img = loadImage('./assets/Background.avif');
}

function setup() {
  createCanvas(800, 600);
  video = createCapture(VIDEO, { flipped: true });
  video.size(640, 480); // Lower resolution for performance
  video.hide();
  handPose.detectStart(video, (results) => hands = results);

  setupMenuButtons();
}

function draw() {
  background(img);

  // Crop video to fill canvas
  const vW = video.width, vH = video.height;
  const videoAspect = vW / vH, canvasAspect = width / height;
  let sx, sy, sw, sh;

  if (videoAspect > canvasAspect) {
    sw = vH * canvasAspect; sh = vH; sx = (vW - sw) / 2; sy = 0;
  } else {
    sw = vW; sh = vW / canvasAspect; sx = 0; sy = (vH - sh) / 2;
  }

  // Apply opacity to video
  tint(255, 255 * 0.3);
  image(video, 0, 0, width, height, sx, sy, sw, sh);
  noTint();

  // Draw visible buttons
  buttons.forEach(btn => {
    if (!btn.hidden) drawButton(btn);
  });

  if (hands.length > 0) handleHandInteraction(sx, sy, sw, sh);
}

// ---------------- BUTTON SETUP ----------------
function setupMenuButtons() {
  buttons = [
    createButtonObj("Start Game", width / 2 - 100, height / 2 - 70, 200, 80, () => showGameOptions()),
    createButtonObj("Settings", width / 2 - 100, height / 2 + 30, 200, 80, () => console.log("Settings Opened")),
  ];
}

function showGameOptions() {
  currentPage = "gameOptions";
  buttons = [
    
    createButtonObj("Single Player", width / 2 - 100, height / 2 - 70, 200, 80, () => {
      window.location.href = "/SingleplayerGame/singleplayer.html"; // Navigate to another page
    }),
    createButtonObj("Multiplayer", width / 2 - 100, height / 2 + 30, 200, 80, () => console.log("Multiplayer Selected")),
    createButtonObj("Back", width / 2 - 100, height / 2 + 130, 200, 80, () => {
      currentPage = "menu";
      setupMenuButtons();
    })
  ];
}

// ---------------- BUTTON LOGIC ----------------
function createButtonObj(label, x, y, w, h, action) {
  return { label, x, y, w, h, hidden: false, action };
}

function drawButton(btn) {
  fill(0, 150); // semi-transparent background
  rect(btn.x, btn.y, btn.w, btn.h, 10); // rounded corners
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(24);
  text(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
}

// ---------------- HAND INTERACTION ----------------
function handleHandInteraction(sx, sy, sw, sh) {
  const hand = hands[0];
  const index = hand.index_finger_tip;
  const thumb = hand.thumb_tip;

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
  const mapX = (origX) => clamp(((origX - sx) / sw) * width, 0, width);
  const mapY = (origY) => clamp(((origY - sy) / sh) * height, 0, height);

  const indexX = mapX(index.x), indexY = mapY(index.y);
  const thumbX = mapX(thumb.x), thumbY = mapY(thumb.y);

  const d = dist(indexX, indexY, thumbX, thumbY);
  const x = (indexX + thumbX) / 2, y = (indexY + thumbY) / 2;

  noStroke();
  fill(d < width * 0.037 ? color(0, 255, 0) : color(255, 0, 255)); // Green when pinching
  circle(x, y, 16);

  const pinchThreshold = width * 0.036;
  const isPinching = d < pinchThreshold;

  buttons.forEach(btn => {
    if (!btn.hidden && x > btn.x && x < btn.x + btn.w && y > btn.y && y < btn.y + btn.h) {
      highlightButton(btn);
      if (isPinching && !lastPinch) {
        btn.action();
        // Optional: play sound effect here
        // sound.play();
      }
    }
  });

  lastPinch = isPinching;
}

function highlightButton(btn) {
  fill(255, 255, 0);
  rect(btn.x, btn.y, btn.w, btn.h, 10);
  fill(0);
  textAlign(CENTER, CENTER);
  textSize(24);
  text(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
}
