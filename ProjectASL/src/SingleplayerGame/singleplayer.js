// ---------------- GLOBAL STATE ----------------
let video, handPose, hands = [];
let classifier;
let classification = "";
let confidence = 0;
let lastClassifyTime = 0;
const classifyInterval = 200; // ms
let lastMatchTime = 0;

let connections;
let arduinoConnected = false;
let arduinoMessage = "";

// Game states
let currentState = "menu"; // "menu", "countdown", "game", "gameover"
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

const fingers = {
  thumb: ["thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip"],
  index: ["index_finger_mcp", "index_finger_pip", "index_finger_dip", "index_finger_tip"],
  middle: ["middle_finger_mcp", "middle_finger_pip", "middle_finger_dip", "middle_finger_tip"],
  ring: ["ring_finger_mcp", "ring_finger_pip", "ring_finger_dip", "ring_finger_tip"],
  pinky: ["pinky_finger_mcp", "pinky_finger_pip", "pinky_finger_dip", "pinky_finger_tip"]
};

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
  drawSpaceBackground();
  // Update button visibility based on state
  if (currentState === "menu") {
    buttons.forEach(btn => btn.visible = ["Start Game", "Exit", "Arduino"].includes(btn.label));
    drawMenu();
  } else if (currentState === "arduino") {
    buttons.forEach(btn => btn.visible = ["Connect", "Back"].includes(btn.label));
    drawArduinoPage();
  } else if (currentState === "countdown") {
    drawCountdown();
  } else if (currentState === "game") {
    drawGame();
  } else if (currentState === "gameover") {
    buttons.forEach(btn => btn.visible = ["Restart", "Main Menu"].includes(btn.label));
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

function drawMenu() {
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(64);
  text("ASL Survival", width / 2, height / 2 - 150);

  // Show
  buttons.filter(btn => btn.label === "Start Game" || btn.label === "Exit" || btn.label === "Arduino")
    .forEach(btn => btn.show());
}

function drawGame() {

  if (hands.length > 0) {
    drawHandSkeleton(hands[0], fingers);
  }


  // Check game duration
  if (millis() - startTime >= gameDuration) {
    endGame();
    return;
  }

  // Classification logic

  if (hands[0]) {
    let now = millis();
    if (now - lastClassifyTime > classifyInterval) {
      let inputData = flattenHandData();
      classifier.classify(inputData, gotClassification);
      lastClassifyTime = now;
    }
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

  // Show
  buttons.filter(btn => btn.label === "Restart" || btn.label === "Main Menu")
    .forEach(btn => btn.show());

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
    this.visible = true; // New property
  }

  show() {
    if (!this.visible) return;
    fill(this.isHovered() ? color(100, 150, 255) : 80);
    rect(this.x, this.y, this.w, this.h, 10);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(24);
    text(this.label, this.x + this.w / 2, this.y + this.h / 2);
  }

  isHovered() {
    return this.visible &&
      mouseX > this.x && mouseX < this.x + this.w &&
      mouseY > this.y && mouseY < this.y + this.h;
  }

  click() {
    if (this.isHovered()) this.callback();
  }
}


// ---------------- MOUSE CLICK ----------------

function mousePressed() {
  for (let btn of buttons) {
    if (btn.visible && btn.isHovered()) {
      btn.click();
      return; // Stop after first button
    }
  }
}


// ---------------- CALLBACKS ----------------
function gotHands(results) {
  hands = results;
}

function gotClassification(results) {
  let sum = results.reduce((acc, r) => acc + r.confidence, 0);
  let normalized = results.map(r => ({ label: r.label, confidence: r.confidence / sum }));
  normalized.sort((a, b) => b.confidence - a.confidence);

  if (normalized[0].confidence >= 0.6) {
    let now = millis();
    let expectedLetter = currentWord[currentIndex];
    if (normalized[0].label === expectedLetter && now - lastMatchTime > 500) {
      currentIndex++;
      lastMatchTime = now;
      if (currentIndex >= currentWord.length) {
        playerScore++;
        currentWord = random(words).toUpperCase();
        currentIndex = 0;
      }
    }
  }
}


function modelLoaded() {
  buttons.push(new Button(width / 2 - 100, height / 2 + 120, 200, 60, "Start Game", () => startCountdown()));
  buttons.push(new Button(width / 2 - 100, height / 2 + 200, 200, 60, "Exit", () => window.location.href = "../index.html"));

  // Add restart button for game over
  buttons.push(new Button(width / 2 - 100, height / 2 + 120, 200, 60, "Restart", () => restartGame()));
  buttons.push(new Button(width / 2 - 100, height / 2 + 200, 200, 60, "Main Menu", () => {
    currentState = "menu";
    playerScore = 0;
    currentWord = random(words).toUpperCase();
    currentIndex = 0;
  }));


  buttons.push(new Button(width / 2 - 100, height / 2 + 40, 200, 60, "Arduino", () => {
    currentState = "arduino";
  }));



  buttons.push(new Button(width / 2 - 100, height / 2 + 120, 200, 60, "Connect", () => {
    console.log("Attempting Arduino connection...");
    arduinoMessage = "Connecting...";

    // Example: Use Web Serial API
    if ("serial" in navigator) {
      navigator.serial.requestPort()
        .then(port => port.open({ baudRate: 9600 }))
        .then(() => {
          arduinoConnected = true;
          arduinoMessage = "Connected!";
          startCountdown(); // Move to countdown
        })
        .catch(err => {
          arduinoConnected = false;
          arduinoMessage = "Connection failed. Try again.";
          console.error(err);
        });
    } else {
      arduinoMessage = "Web Serial not supported.";
    }
  }));

  buttons.push(new Button(width / 2 - 100, height / 2 + 200, 200, 60, "Back", () => {
    currentState = "menu";
  }));
}


function drawArduinoPage() {
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(64);
  text("Arduino Setup", width / 2, height / 2 - 150);

  textSize(32);
  text(arduinoMessage, width / 2, height / 2);

  buttons.filter(btn => btn.label === "Connect" || btn.label === "Back")
    .forEach(btn => btn.show());
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


function drawSpaceBackground() {
  background(0); // Black space
  noStroke();
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
  for (let s of drawSpaceBackground.stars) {
    let alpha = map(sin(frameCount * 0.02 + s.phase), -1, 1, 100, 255);
    fill(255, alpha);
    ellipse(s.x, s.y, s.size, s.size);
  }
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