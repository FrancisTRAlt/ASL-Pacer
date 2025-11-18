// ---------------- GLOBAL STATE ----------------
let video, handPose, hands = [];
let classifier;
let classification = "???";
let confidence = 0;

let connections;

// Game states
let currentState = "countdown"; // "menu", "countdown", "game", "gameover"
let countdownStartTime = null;
let startTime = null;
let gameDuration = 60000; // 1 minute
let playerScore = 0;
let playerName = "";

// Word game state
let words = [];
let currentWord = "";
let currentIndex = 0;

// Buttons
let buttons = [];

// ---------------- PRELOAD ----------------
function preload() {
  handPose = ml5.handPose({ flipped: true });
  words = loadStrings("../lib/words_alpha.txt");
}

// ---------------- SETUP ----------------
function setup() {
  createCanvas(800, 600);
  playerName = "Player" + floor(random(1000, 9999));

  // Webcam setup
  video = createCapture(VIDEO, { flipped: true });
  video.size(800, 600);
  video.hide();

  ml5.setBackend("webgl");

  // Neural network setup
  let classifierOptions = { task: "classification" };
  classifier = ml5.neuralNetwork(classifierOptions);

  let modelDetails = {
    model: "../ml5Model/model.json",
    metadata: "../ml5Model/model_meta.json",
    weights: "../ml5Model/model.weights.bin",
  };

  classifier.load(modelDetails, modelLoaded);

  handPose.detectStart(video, gotHands);
  connections = handPose.getConnections();

  // Initialize first word
  currentWord = random(words).toUpperCase();
  currentIndex = 0;
}

// ---------------- DRAW ----------------
function draw() {
  background(30);
  if (currentState === "countdown") {
    drawCountdown();
  } else if (currentState === "game") {
    drawGame();
  } else if (currentState === "gameover") {
    drawGameOver();
  }
}

// ---------------- COUNTDOWN ----------------
function drawCountdown() {
  let elapsed = millis() - countdownStartTime;
  let remaining = 3 - floor(elapsed / 1000);

  textAlign(CENTER, CENTER);
  textSize(128);
  fill(255);

  if (remaining >= 0) {
    text(remaining, width / 2, height / 2);
  } else {
    currentState = "game";
    startTime = millis();
  }
}

// ---------------- GAME ----------------
function drawGame() {
  drawPixelatedVideo();

  // Check game duration
  if (millis() - startTime >= gameDuration) {
    endGame();
    return;
  }

  // Classification logic
  if (hands[0]) {
    let inputData = flattenHandData();
    classifier.classify(inputData, gotClassification);
  }

  // UI
  fill("black");
  rect(width / 2 - 350, height / 2 + 20, 700, 350, 20);

  let boxCenterX = width / 2;
  let boxCenterY = height / 2 + 190;

  // Word display
  textAlign(CENTER, CENTER);
  textSize(48);
  let spacing = 70;
  let totalWidth = (currentWord.length - 1) * spacing;
  let startX = boxCenterX - totalWidth / 2;

  for (let i = 0; i < currentWord.length; i++) {
    let letter = currentWord[i];
    let xPos = startX + i * spacing;

    if (i < currentIndex) {
      let glowStrength = abs(sin(frameCount * 0.1)) * 20;
      let glowColor = color(0, 255, 0, glowStrength);
      stroke(glowColor);
      strokeWeight(8);
      fill(0, 255, 0);
    } else {
      noStroke();
      fill(255);
    }

    text(letter, xPos, boxCenterY);
  }
  strokeWeight(0);

  // Timer
  let elapsed = millis() - startTime;
  let seconds = floor(elapsed / 1000);
  let minutes = floor(seconds / 60);
  seconds = seconds % 60;
  let timerText = nf(minutes, 2) + ":" + nf(seconds, 2);

  textSize(32);
  fill(255);
  text(timerText, boxCenterX - 280, boxCenterY - 120);

  // Classification display
  textAlign(CENTER, CENTER);
  textSize(64);
  fill(0, 255, 0);
  text(classification, boxCenterX, boxCenterY - 100);
  classification = "";
}

// ---------------- GAME OVER ----------------
function drawGameOver() {
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(64);
  text("Game Over!", width / 2, height / 2 - 100);

  textSize(32);
  text(`Username: ${playerName}`, width / 2, height / 2);
  text(`Words Completed: ${playerScore}`, width / 2, height / 2 + 60);

  buttons.forEach(btn => btn.show());
}

// ---------------- BUTTON CLASS ----------------
class Button {
  constructor(x, y, w, h, label, callback) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.label = label;
    this.callback = callback;
  }

  show() {
    fill(80);
    rect(this.x, this.y, this.w, this.h, 10);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(24);
    text(this.label, this.x + this.w / 2, this.y + this.h / 2);
  }

  isHovered() {
    return mouseX > this.x && mouseX < this.x + this.w &&
           mouseY > this.y && mouseY < this.y + this.h;
  }

  click() {
    if (this.isHovered()) this.callback();
  }
}

// ---------------- MOUSE CLICK ----------------
function mousePressed() {
  buttons.forEach(btn => btn.click());
}

// ---------------- CALLBACKS ----------------
function gotHands(results) {
  hands = results;
}

function gotClassification(results) {
  let sum = results.reduce((acc, r) => acc + r.confidence, 0);
  let normalized = results.map(r => ({
    label: r.label,
    confidence: r.confidence / sum
  }));

  normalized.sort((a, b) => b.confidence - a.confidence);

  if (normalized[0].confidence >= 0.6) {
    classification = normalized[0].label;

    let expectedLetter = currentWord[currentIndex];
    if (classification === expectedLetter) {
      currentIndex++;
      if (currentIndex >= currentWord.length) {
        playerScore++;
        currentWord = random(words).toUpperCase();
        currentIndex = 0;
      }
    }
  }
}

function modelLoaded() {
  // Add restart button for game over
  buttons.push(new Button(width / 2 - 100, height / 2 + 120, 200, 60, "Restart", () => restartGame()));
  buttons.push(new Button(width / 2 - 100, height / 2 + 200, 200, 60, "Main Menu", () => window.location.href = "../index.html"));
}

function startCountdown() {
  currentState = "countdown";
  countdownStartTime = millis();
}

function endGame() {
  currentState = "gameover";
}

function restartGame() {
  playerScore = 0;
  currentWord = random(words).toUpperCase();
  currentIndex = 0;
  startCountdown();
}

// ---------------- HAND DATA ----------------
function flattenHandData() {
  if (!hands[0]) return [];

  let hand = hands[0];
  let xs = hand.keypoints.map(k => k.x);
  let ys = hand.keypoints.map(k => k.y);
  let minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);

  let handData = [];

  for (let i = 0; i < hand.keypoints.length; i++) {
    let keypoint = hand.keypoints[i];
    let normX = (keypoint.x - minX) / (maxX - minX);
    let normY = (keypoint.y - minY) / (maxY - minY);
    handData.push(normX, normY);
  }

  for (let j = 0; j < connections.length; j++) {
    let pointAIndex = connections[j][0];
    let pointBIndex = connections[j][1];
    let pointA = hand.keypoints[pointAIndex];
    let pointB = hand.keypoints[pointBIndex];

    let dx = (pointB.x - pointA.x) / (maxX - minX);
    let dy = (pointB.y - pointA.y) / (maxY - minY);
    let distance = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx) / Math.PI;

    handData.push(distance);
    handData.push(angle);
  }

  return handData;
}

// ---------------- PIXELATED VIDEO ----------------
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