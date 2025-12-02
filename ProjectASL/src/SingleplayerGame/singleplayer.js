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
let arduinoPort = null; // Track the port globally

// Game states
let currentState = "menu"; // "menu", "countdown", "game", "gameover"
let countdownStartTime = null;
let startTime = null;
let gameDuration = 60000; // 1 minute
let playerScore = 0;

//Checkpoints
let checkpointsReached = 0;
let checkpointInterval = 60000; // 1 minute
let nextCheckpointTime = null;

// Word game state
let words = [];
let currentWord = "";
let currentIndex = 0;

let letterSpeeds = []; // Track time per letter
let wordSpeeds = [];   // Track average time per word
let letterStartTime = 0; // Start time for current letter

// Buttons
let buttons = [];

const fingers = {
  thumb: ["thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip"],
  index: ["index_finger_mcp", "index_finger_pip", "index_finger_dip", "index_finger_tip"],
  middle: ["middle_finger_mcp", "middle_finger_pip", "middle_finger_dip", "middle_finger_tip"],
  ring: ["ring_finger_mcp", "ring_finger_pip", "ring_finger_dip", "ring_finger_tip"],
  pinky: ["pinky_finger_mcp", "pinky_finger_pip", "pinky_finger_dip", "pinky_finger_tip"]
};

// --- PLAYER STATE ---
let player;

// HUD style constants
let HUD;


let supabaseClient;

async function initSupabase() {
  const response = await fetch('../config.json'); // adjust path
  const config = await response.json();
  supabaseClient = supabase.createClient(config.supabase.url, config.supabase.anonKey);
  console.log('Supabase initialized in singleplayer');
}


// ---------------- PRELOAD ----------------
function preload() {
  handPose = ml5.handPose({ flipped: true });
  words = loadStrings("../lib/words_alpha.txt");
}

// ---------------- SETUP ----------------
function setup() {
  createCanvas(800, 600);
  player = {
    name: "",        // will be set in setup()
    health: 50,     // UI only for now
    maxHealth: 50,
    coins: 0         // UI only for now
  };
  // HUD style constants
  HUD = {
    x: 30,
    y: 20,
    width: 300,
    height: 26,
    bgColor: color(30, 30, 30, 180),
    borderColor: color("cyan"),
    nameColor: color(255),
    coinColor: color(255, 215, 0), // gold
    spacing: 12
  };
  player.name = "Player" + floor(random(1000, 9999));

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

  if (navigator.onLine) {
    initSupabase();
  } else {
    console.warn("Offline: Supabase will not be initialized.");
  }
}

// ---------------- DRAW ----------------
function draw() {
  drawSpaceBackground();
  // Update button visibility based on state
  if (currentState === "menu") {
    buttons.forEach(btn => btn.visible = ["Start Game", "Exit", "Arduino"].includes(btn.label));
    drawMenu();
  } else if (currentState === "arduino") {
    buttons.forEach(btn => btn.visible = ["Connect", "Disconnect", "Back"].includes(btn.label));
    drawArduinoPage();
  } else if (currentState === "countdown") {
    drawCountdown();
  } else if (currentState === "game") {
    drawGame();
  } else if (currentState === "checkpoint") {
    drawCheckpoint();
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

  drawHUD(); //Remove later

  // Show
  buttons.filter(btn => btn.label === "Start Game" || btn.label === "Exit" || btn.label === "Arduino")
    .forEach(btn => btn.show());

  // Arduino status bottom-right
  textAlign(RIGHT, BOTTOM);
  textSize(20);
  fill(arduinoConnected ? "lime" : "red");
  text(arduinoConnected ? "Arduino Connected" : "Arduino Disconnected", width - 20, height - 20);
}

function drawGame() {

  if (hands.length > 0) {
    drawHandSkeleton(hands[0], fingers);
  }


  // HUD
  drawHUD();

  // Endless checkpoint logic
  let elapsed = millis() - startTime;

  if (!nextCheckpointTime) nextCheckpointTime = startTime + checkpointInterval;

  if (millis() >= nextCheckpointTime) {
    currentState = "checkpoint";
    checkpointsReached++;
    nextCheckpointTime += checkpointInterval;
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
  text(`Username: ${player.name}`, width / 2, height / 2);
  text(`Words Completed: ${playerScore}`, width / 2, height / 2 + 60);

  // Optional: show final HUD snapshot
  drawHUD();

  // Show
  buttons.filter(btn => btn.label === "Restart" ||
    btn.label === "Main Menu")
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

async function gotClassification(results) {
  let sum = results.reduce((acc, r) => acc + r.confidence, 0);
  let normalized = results.map(r => ({ label: r.label, confidence: r.confidence / sum }));
  normalized.sort((a, b) => b.confidence - a.confidence);

  if (normalized[0].confidence >= 0.6) {
    let now = millis();
    let expectedLetter = currentWord[currentIndex];
    if (normalized[0].label === expectedLetter && now - lastMatchTime > 500) {
      currentIndex++;
      lastMatchTime = now;

      let timeTaken = now - letterStartTime;
      letterSpeeds.push(timeTaken);
      console.log(`Letter signed in ${(timeTaken / 1000).toFixed(2)} s`);
      letterStartTime = now; // Reset for next letter

      if (currentIndex >= currentWord.length) {

        let sum = letterSpeeds.reduce((a, b) => a + b, 0);
        let avg = sum / letterSpeeds.length;
        wordSpeeds.push(avg);
        console.log(`Average word signing speed: ${(avg / 1000).toFixed(2)} s`);
        letterSpeeds = [];
        playerScore++;

        // Update Arduino with new average speed
        if (arduinoConnected && arduinoPort && arduinoPort.writable) {
          try {
            const writer = arduinoPort.writable.getWriter();
            let total = wordSpeeds.reduce((a, b) => a + b, 0);
            let avgLetterSpeed = (total / wordSpeeds.length) / 1000; // ms to s
            const message = `${player.name},${avgLetterSpeed.toFixed(2)}\n`;
            await writer.write(new TextEncoder().encode(message));
            console.log("Updated Arduino:", message);
            writer.releaseLock();
          } catch (err) {
            console.error("Error updating Arduino:", err);
          }
        }

        // Reward coins based on word length
        if (currentWord.length <= 4) {
          player.coins += 1; // small word
        } else {
          player.coins += 2; // big word
        }

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
    player.health = player.maxHealth; // Reset HP
    player.coins = 0;                 // Reset coins
    currentWord = random(words).toUpperCase();
    currentIndex = 0;
  }));


  buttons.push(new Button(width / 2 - 100, height / 2 + 40, 200, 60, "Arduino", () => {
    currentState = "arduino";
  }));




  buttons.push(new Button(width / 2 - 220, height / 2 + 120, 200, 60, "Connect", () => {
    console.log("Attempting Arduino connection...");
    arduinoMessage = "Connecting...";
    if ("serial" in navigator) {
      navigator.serial.requestPort()
        .then(port => {
          arduinoPort = port;
          const info = port.getInfo();
          console.log("VID:", info.usbVendorId, "PID:", info.usbProductId);
          if (info.usbVendorId === 0x2341 && (info.usbProductId === 0x805a || info.usbProductId === 0x005a)) {
            console.log("Arduino Nano 33 BLE detected!");
            return port.open({ baudRate: 9600 });
          } else {
            throw new Error("Not an Arduino Nano 33 BLE. VID/PID mismatch.");
          }
        })
        .then(async () => {
          arduinoConnected = true;
          arduinoMessage = "Connected!";
          currentState = "menu";

          // Compute current average letter speed (or 0 if none yet)
          let avgLetterSpeed = 0;
          if (wordSpeeds.length > 0) {
            let sum = wordSpeeds.reduce((a, b) => a + b, 0);
            avgLetterSpeed = (sum / wordSpeeds.length) / 1000; // ms to s
          }

          // Send player name and avg speed to Arduino
          if (arduinoPort && arduinoPort.writable) {
            try {
              const writer = arduinoPort.writable.getWriter();
              const message = `${player.name},${avgLetterSpeed.toFixed(2)}\n`;
              await writer.write(new TextEncoder().encode(message));
              console.log("Sent to Arduino on connect:", message);
              writer.releaseLock();
            } catch (err) {
              console.error("Error sending initial data to Arduino:", err);
            }
          }
        }).catch(err => {
          arduinoConnected = false;
          arduinoMessage = "Connection failed or wrong device.";
          console.error(err);

        });

      arduinoPort = port; // Save globally

    } else {
      arduinoMessage = "Web Serial not supported.";
    }
  }));




  buttons.push(new Button(width / 2 + 20, height / 2 + 120, 200, 60, "Disconnect", async () => {
    if (arduinoPort) {
      try {
        // Cancel any active reader
        if (arduinoPort.readable) {
          const reader = arduinoPort.readable.getReader();
          await reader.cancel();
          reader.releaseLock();
        }

        // Cancel any active writer
        if (arduinoPort.writable) {
          const writer = arduinoPort.writable.getWriter();
          await writer.close();
          writer.releaseLock();
        }

        // Close the port
        await arduinoPort.close();

        // Update state
        arduinoConnected = false;
        arduinoMessage = "Disconnected!";
        currentState = "menu";
        arduinoPort = null;
        console.log("Arduino disconnected successfully.");
      } catch (err) {
        console.error("Error disconnecting:", err);
        arduinoMessage = "Error disconnecting.";
      }
    } else {
      arduinoMessage = "No device connected.";
    }


  }));

  buttons.push(new Button(width / 2 - 100, height / 2 + 200, 200, 60, "Back", () => {
    currentState = "menu";
  }));




  buttons.push(new Button(width / 2 - 100, height / 2 + 120, 240, 60, "Pay", () => {
    let requiredCoins = 5 + (checkpointsReached - 1) * 2;
    if (player.coins >= requiredCoins) {
      player.coins -= requiredCoins;
      resetWord();
      currentState = "game"; // Safe because HP isn't affected
    } else {
      applyPenalty(); // Handles gameover or continue
    }
  }));



  buttons.push(new Button(width / 2 - 100, height / 2 + 200, 240, 60, "Proceed without Pay", () => {
    applyPenalty();
  }));
}


function drawArduinoPage() {
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(64);
  text("Arduino Setup", width / 2, height / 2 - 150);

  textSize(32);
  text(arduinoMessage, width / 2, height / 2);

  buttons.filter(btn => btn.label === "Connect" || btn.label === "Disconnect" || btn.label === "Back")
    .forEach(btn => btn.show());
}


function startCountdown() {
  currentState = "countdown";
  countdownStartTime = millis();
  checkpointsReached = 0;
  nextCheckpointTime = null; // will set after game starts
}


async function endGame() {
  currentState = "gameover";

  if (wordSpeeds.length > 0) {
    let maxAvg = Math.max(...wordSpeeds);
    console.log(`Highest average signing speed: ${(maxAvg / 1000).toFixed(2)} s`);
  } else {
    console.log('No words completed, no speed data available.');
  }
  letterSpeeds = [];
  wordSpeeds = [];
  letterStartTime = 0;

  // Prepare data
  const gameData = {
    PlayerName: player.name,
    Miles: playerScore,
    Coins: player.coins,
    // HealthRemaining: player.health,
    // CheckpointsReached: checkpointsReached,
    // Timestamp: new Date().toISOString()
  };

  // Insert into Supabase


  if (navigator.onLine) {
    const { data, error } = await supabaseClient
      .from('ASL-DataBase') // your table name
      .insert([gameData]);

    if (error) {
      console.error('Error inserting game data:', error);
    } else {
      console.log('Game data inserted:', data);
    }
  } else {
    console.warn("Offline.");
  }
}


function restartGame() {
  playerScore = 0;
  player.health = player.maxHealth; // Reset HP
  player.coins = 0;                 // Reset coins
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


function drawHUD() {
  // Panel background
  noStroke();
  fill(HUD.bgColor);
  rect(HUD.x, HUD.y, 480, HUD.height + 50, 10);

  // --- Player Name ---
  fill(HUD.nameColor);
  textAlign(LEFT, CENTER);
  textSize(20);
  text(`👤 ${player.name}`, HUD.x + 10, HUD.y + HUD.height / 2 + 4);

  // --- Health Bar ---
  const barX = HUD.x + 10;
  const barY = HUD.y + HUD.height + HUD.spacing;
  const barW = HUD.width;
  const barH = HUD.height;

  // Background bar
  fill(20, 20, 20, 220);
  rect(barX, barY, barW, barH, 6);

  // Health fraction
  const frac = constrain(player.health / player.maxHealth, 0, 1);

  // Bar color (green → yellow → red)
  const healthColor = lerpColor(
    color(255, 0, 0),    // red
    color(255, 255, 0),  // yellow
    frac < 0.5 ? frac * 2 : 1
  );
  const healthColor2 = lerpColor(
    color(255, 255, 0),  // yellow
    color(0, 200, 0),    // green
    frac < 0.5 ? 0 : (frac - 0.5) * 2
  );
  // blend across two ranges
  const blended = frac < 0.5 ? healthColor : healthColor2;

  fill(blended);
  rect(barX, barY, barW * frac, barH, 6);

  // Border and label
  noFill();
  stroke(HUD.borderColor);
  strokeWeight(1.5);
  rect(barX, barY, barW, barH, 6);
  noStroke();
  fill(255);
  textSize(14);
  textAlign(LEFT, CENTER);
  text(`HP: ${player.health}/${player.maxHealth}`, barX + 6, barY + barH / 2);

  // --- Coins ---
  const coinTextX = HUD.x + barW + 30;
  const coinTextY = HUD.y + HUD.height + HUD.spacing + barH / 2;

  fill(HUD.coinColor);
  textSize(18);
  textAlign(LEFT, CENTER);
  text(`🪙 Coins: ${player.coins}`, coinTextX, coinTextY);
}



function drawCheckpoint() {
  background(0);
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(48);
  text(`Checkpoint ${checkpointsReached}`, width / 2, height / 2 - 150);

  textSize(32);
  let requiredCoins = 5 + (checkpointsReached - 1) * 2;
  text(`Need ${requiredCoins} coins to proceed safely`, width / 2, height / 2 - 60);

  drawHUD();

  // Show only Pay and Proceed buttons
  buttons.forEach(btn => btn.visible = false);
  buttons.filter(btn => btn.label === "Pay" || btn.label === "Proceed without Pay")
    .forEach(btn => btn.visible = true);
  buttons.filter(btn => btn.label === "Pay" || btn.label === "Proceed without Pay")
    .forEach(btn => btn.show());
}


function applyPenalty() {
  let damage = checkpointsReached * (player.coins + 1); // base damage even if coins = 0
  player.health -= damage;
  if (player.health <= 0) {
    endGame();
  } else {
    resetWord();
    currentState = "game";
  }
}

function resetWord() {
  currentWord = random(words).toUpperCase();
  currentIndex = 0;
  letterStartTime = millis(); // Start timing first letter
}