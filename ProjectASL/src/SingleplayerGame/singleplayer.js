
// ------------------------------------------------
// OFFLINE MODE SAFEGUARDS (refs: main.js style)
// ------------------------------------------------
// Set NET_TEST_OVERRIDE to:
// null -> use real navigator.onLine (default)
// true -> force ONLINE (testing)
// false -> force OFFLINE (testing)
let NET_TEST_OVERRIDE = null;
function isOnline() {
  return (NET_TEST_OVERRIDE === null) ? navigator.onLine : !!NET_TEST_OVERRIDE;
}
// Track offline mode at runtime (auto-updates in draw())
let offlineMode = false;

// ------------------------------------------------
// GLOBAL STATE
// ------------------------------------------------
let video, handPose, hands = [];
let classifier;
let classification = "";
let confidence = 0;
let lastClassifyTime = 0;
const classifyInterval = 200; // ms
let lastMatchTime = 0;
let isClassifying = false; // prevent overlapping classify calls
let finalizing = false;     // guard against double finalization
let connections;

const fingers = {
  thumb: ["thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip"],
  index: ["index_finger_mcp", "index_finger_pip", "index_finger_dip", "index_finger_tip"],
  middle: ["middle_finger_mcp", "middle_finger_pip", "middle_finger_dip", "middle_finger_tip"],
  ring: ["ring_finger_mcp", "ring_finger_pip", "ring_finger_dip", "ring_finger_tip"],
  pinky: ["pinky_finger_mcp", "pinky_finger_pip", "pinky_finger_dip", "pinky_finger_tip"]
};

// Arduino Connections
let arduinoConnected = false;
let arduinoMessage = "";
let arduinoMessageTime = 0;
let arduinoPort = null;   // Track the port globally
let arduinoReader = null; // track the active reader globally
let stopArduinoRead = false; // signal to stop the read loop

// Game states
let currentState = "menu"; // "menu", "countdown", "checkpoint", "game", "gameover"
let countdownStartTime = null;
let startTime = null;
let gameDuration = 60000; // 1 minute
let playerScore = 0;
let coinsPaid = 0;
let pausedTime = 0; // total time paused
let checkpointStartTime = 0;

// Checkpoints
let checkpointsReached = 0;
let checkpointInterval = 60000; // 1 minute
let nextCheckpointElapsed = null;

// Word game state
let words = [];
let currentWord = "";
let currentIndex = 0;
let letterSpeeds = []; // Track time per letter
let wordSpeeds = [];  // Track average time per word
let letterStartTime = 0; // Start time for current letter

// Buttons
let buttons = [];

// PLAYER STATE
let player;
let usernameInput;

// HUD style constants
let HUD;

// Decoration Ship
let shipX = -100; // start off-screen
let shipY = 100;  // vertical position
let shipSpeed = 5;
let lastShipSpawn = 0;
let shipVisible = false;

// Database
let supabaseClient;
async function initSupabase() {
  const response = await fetch('../config.json'); // get our API keys
  const config = await response.json();
  supabaseClient = supabase.createClient(config.supabase.url, config.supabase.anonKey);
  console.log('Supabase initialized in singleplayer');
}

// ------------------------------------------------
// PRELOAD
// ------------------------------------------------
function preload() {
  // *** PATCH: Use MediaPipe runtime and local solutionPath for offline ***
  // This prevents tfhub fetches when offline (ERR_INTERNET_DISCONNECTED).
  // Ref: ml5 next-gen runtime differences + offline model options.
  // https://github.com/ml5js/ml5-next-gen/issues/237
  // https://github.com/ml5js/ml5-next-gen/issues/16
  handPose = ml5.handPose({
    flipped: true,
    runtime: 'mediapipe',
    solutionPath: '../lib/mediapipe/hands'
  });

  words = loadStrings("../lib/words_alpha.txt");
}

// ------------------------------------------------
/* SETUP */
// ------------------------------------------------
function setup() {
  createCanvas(800, 600);

  player = {
    name: "", // will be set in setup()
    health: 50, // UI only for now
    maxHealth: 50,
    coins: 0 // UI only for now
  };

  usernameInput = createInput(player.name);
  usernameInput.position((width - usernameInput.width) / 2 - 7, height / 2 - 80);
  usernameInput.size(230);
  usernameInput.hide; // (harmless no-op; actual hide() below)

  // Add styling for Arduino page input
  usernameInput.style('font-size', '20px');
  usernameInput.style('padding', '5px');
  usernameInput.style('border', '2px solid cyan');
  usernameInput.style('border-radius', '8px');
  usernameInput.style('background-color', '#111');
  usernameInput.style('color', '#0ff');
  usernameInput.style('text-align', 'center');
  usernameInput.style('outline', 'none'); // Removes default focus outline
  usernameInput.hide();

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

  // *** PATCH: REMOVE TF.js backend selection (TF-only; not needed with MediaPipe) ***
  // ml5.setBackend("webgl");

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
  currentWord = random(words).toUpperCase().replace(/\s+/g, '');
  currentIndex = 0;
  letterStartTime = millis(); // start timing the first letter

  // --- Offline initialization & DB safeguard ---
  offlineMode = !isOnline();
  if (!offlineMode) {
    initSupabase().catch(e => {
      console.warn("Supabase init failed:", e);
      // remain usable even if DB fails
    });
  } else {
    console.warn("Offline: Supabase will not be initialized.");
  }
}

// ------------------------------------------------
// DRAW
// ------------------------------------------------
function draw() {
  drawSpaceBackground();

  // --- Refresh offline state every frame (handles mid-session changes or NET_TEST_OVERRIDE) ---
  const nowOffline = !isOnline();
  if (nowOffline !== offlineMode) {
    offlineMode = nowOffline;
    if (!offlineMode) {
      // Came back online: lazily initialize Supabase if not ready
      if (!supabaseClient) {
        initSupabase().catch(e => console.warn("Supabase re-init failed:", e));
      }
    } else {
      // Went offline: optional clean-up; keep playing locally
      // supabaseClient can remain; we will guard its usage
      console.log("Entered Offline Mode – network features disabled.");
    }
  }

  // Online/Offline HUD
  drawOnlineStatus();
  if (offlineMode) drawOfflineBanner();

  // Update button visibility based on state
  if (currentState === "menu") {
    drawMenu();
  } else if (currentState === "arduino") {
    drawArduinoPage();
  } else if (currentState === "countdown") {
    drawCountdown();
  } else if (currentState === "game") {
    drawGame();
  } else if (currentState === "checkpoint") {
    drawCheckpoint();
  } else if (currentState === "gameover") {
    drawGameOver();
  }

  if (currentState !== "arduino" && usernameInput) {
    usernameInput.hide();
  }

  // Arduino status bottom-right
  textAlign(RIGHT, BOTTOM);
  textSize(20);
  fill(arduinoConnected ? "lime" : "red");
  text(arduinoConnected ? "Arduino Connected" : "Arduino Disconnected", width - 20, height - 20);
}

// ------------------------------------------------
// MAIN MENU
// ------------------------------------------------
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

function drawMenu() {
  buttons.forEach(btn => { btn.visible = false; });

  textAlign(CENTER, CENTER);
  fill(255);
  textSize(64);
  text("Singleplayer", width / 2, height / 2 - 150);

  drawHUD(); // Remove later

  // Show
  buttons
    .filter(btn => ["Start Game", "Exit", "Arduino"].includes(btn.label))
    .forEach(btn => { btn.visible = true; btn.show(); });
}

// ------------------------------------------------
// ARDUINO SETUP
// ------------------------------------------------
async function listenToArduino() {
  if (arduinoPort && arduinoPort.readable) {
    stopArduinoRead = false; // allow reading
    const reader = arduinoPort.readable.getReader();
    arduinoReader = reader; // keep a reference
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (!stopArduinoRead) {
        const { value, done } = await reader.read();
        if (done) break; // reader.cancel() will cause done=true
        buffer += decoder.decode(value);

        // Process complete lines
        let nl;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;

          console.log("Arduino says:", line);
          if (currentState === "checkpoint" && line.includes("BUTTON PRESSED!")) {
            payCoinLogic();
          }
        }
      }
    } catch (err) {
      // This often fires as "NetworkError: The device has been lost."
      // or "DOMException: ReadableStream" when cancelling—safe to ignore.
      console.warn("Reader loop ended:", err?.message ?? err);
    } finally {
      try { reader.releaseLock(); } catch {}
      arduinoReader = null; // clear reference
    }
  }
}

function drawArduinoPage() {
  buttons.forEach(btn => { btn.visible = false; });

  textAlign(CENTER, CENTER);
  fill(255);
  textSize(64);
  text("Arduino Setup", width / 2, height / 2 - 150);

  // Show message only if within 5 seconds
  if (arduinoMessage && millis() - arduinoMessageTime < 5000) {
    textSize(32);
    text(arduinoMessage, width / 2, height / 2);
  }

  if (arduinoConnected) {
    usernameInput.show();
    usernameInput.position((width - usernameInput.width) / 2 - 7, height / 2 - 80);

    textSize(24);
    fill(200);
    text("Enter your username", width / 2, height / 2 - 100);
    usernameInput.style('box-shadow', '0 0 15px cyan');

    buttons
      .filter(btn => ["Disconnect", "Save Username", "Back"].includes(btn.label))
      .forEach(btn => { btn.visible = true; btn.show(); });
  } else {
    usernameInput.hide();
    buttons
      .filter(btn => ["Connect", "Back"].includes(btn.label))
      .forEach(btn => { btn.visible = true; btn.show(); });
  }
}

// ------------------------------------------------
// COUNTDOWN
// ------------------------------------------------
function startCountdown() {
  currentState = "countdown";
  countdownStartTime = millis();
  checkpointsReached = 0;
  nextCheckpointElapsed = null;
}

function drawCountdown() {
  buttons.forEach(btn => { btn.visible = false; });

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

// ------------------------------------------------
// GAME
// ------------------------------------------------
function drawGame() {
  buttons.forEach(btn => { btn.visible = false; });

  // --- Fallback: if all letters are complete but finalization didn't run, run it here
  if (currentIndex >= currentWord.length) {
    finalizeWord();
  }

  if (hands.length > 0) {
    drawHandSkeleton(hands[0], fingers);
  }

  // HUD
  drawHUD();

  // --- Endless checkpoint logic driven by elapsed game time ---
  let elapsed = millis() - startTime - pausedTime;

  // Initialize the first checkpoint threshold to 1 minute of elapsed time
  if (!nextCheckpointElapsed) nextCheckpointElapsed = checkpointInterval; // 60000

  // Trigger when the elapsed game time crosses the threshold
  if (elapsed >= nextCheckpointElapsed) {
    currentState = "checkpoint";
    checkpointsReached++;
    checkpointStartTime = millis(); // record absolute start to accumulate pausedTime later
    nextCheckpointElapsed += checkpointInterval; // schedule next at +1 min of elapsed time
    return;
  }

  // Classification logic with overlap guard
  if (hands[0]) {
    const now = millis();
    if (!isClassifying && (now - lastClassifyTime > classifyInterval)) {
      const inputData = flattenHandData();
      isClassifying = true;
      lastClassifyTime = now;

      classifier.classify(inputData, (results) => {
        try {
          gotClassification(results);
        } finally {
          isClassifying = false;
        }
      });
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

  let now = millis();
  if (now - lastShipSpawn > 10000) { // every 10 seconds
    shipX = -100; // reset to left
    shipVisible = true;
    lastShipSpawn = now;
  }

  // Make the ship fly
  if (shipVisible) {
    shipX += shipSpeed;
    // Ship body
    fill(50, 150, 255); // main color
    rect(shipX, shipY, 80, 30, 8); // rounded body
    // Cockpit
    fill(200, 255, 255);
    ellipse(shipX + 20, shipY + 15, 20, 15);
    // Wings
    fill(100, 180, 255);
    triangle(shipX + 10, shipY - 10, shipX + 40, shipY, shipX + 10, shipY + 10); // top wing
    triangle(shipX + 10, shipY + 30, shipX + 40, shipY + 30, shipX + 10, shipY + 40); // bottom wing
    // Tail fins
    fill(80, 130, 255);
    rect(shipX - 5, shipY + 5, 15, 20);
    // Exhaust flames
    fill(random(200, 255), random(100, 200), 0);
    triangle(shipX - 20, shipY + 10, shipX - 5, shipY + 5, shipX - 5, shipY + 25);
    // Hide when off-screen
    if (shipX > width + 100) shipVisible = false;
  }
}

function drawCheckpoint() {
  buttons.forEach(btn => { btn.visible = false; });
  background(0);

  textAlign(CENTER, CENTER);
  fill(255);
  textSize(48);
  text(`Checkpoint ${checkpointsReached}`, width / 2, height / 2 - 150);

  let requiredCoins = 5 + (checkpointsReached - 1) * 2;
  textSize(32);
  text(`Need ${requiredCoins} coins to proceed safely`, width / 2, height / 2 - 60);

  // Show progress
  textSize(28);
  fill(200, 255, 200);
  text(`Paid: ${coinsPaid}/${requiredCoins}`, width / 2, height / 2 + 20);

  drawHUD();

  // If Arduino connected, show message instead of button
  if (arduinoConnected) {
    textSize(24);
    fill(255, 200, 0);
    text("Press the button on your Arduino to pay", width / 2 - 210, height / 2 + 100);
  } else {
    // Show Pay button if Arduino is NOT connected
    buttons
      .filter(btn => ["Pay 1 Coin"].includes(btn.label))
      .forEach(btn => { btn.visible = true; btn.show(); });
  }
}

function applyPenalty(coinDebt) {
  let damage = checkpointsReached * (coinDebt); // Cal based on the current checkpoint and the user's debt on that checkpoint
  player.health -= damage;
  if (player.health <= 0) {
    endGame();
  } else {
    resetWord();
    currentState = "game";
  }
}

// ------------------------------------------------
// GAME OVER
// ------------------------------------------------
async function endGame() {
  currentState = "gameover";

  // Normalize name: trim & ensure not empty
  const normalizedName = String(player.name ?? "").trim();
  if (!normalizedName) {
    console.warn("No player name; skipping DB write.");
    return;
  }

  const gameData = {
    PlayerName: normalizedName,
    Miles: playerScore,
    Coins: player.coins,
  };

  // --- Offline-safe DB write flow (mirrors main.js guards) ---
  if (!offlineMode) { // We can upload to database if we are online
    try {
      // Ensure supabaseClient exists; if not, try to init (could have started offline)
      if (!supabaseClient) {
        await initSupabase().catch(e => {
          console.error('Supabase init failed during endGame:', e);
        });
      }
      if (!supabaseClient) {
        console.warn("Online but Supabase not initialized; skipping DB write.");
        return;
      }

      // 1) Check if a record with this PlayerName exists (exact match, case-sensitive)
      const { data: existing, error: selectError } = await supabaseClient
        .from('ASL-DataBase')
        .select('PlayerName')
        .eq('PlayerName', normalizedName)
        .limit(1); // defensive: at most one row

      if (selectError) {
        console.error('Error checking username:', selectError);
        return;
      }

      if (existing && existing.length > 0) {
        // 2) Update matched record; chain .select() to see returned row
        const { data, error } = await supabaseClient
          .from('ASL-DataBase')
          .update(gameData)
          .eq('PlayerName', normalizedName)
          .select();
        if (error) {
          console.error('Error updating game data:', error);
        } else {
          console.log('Game data updated:', data);
        }
      } else {
        // 3) Insert new record; chain .select() to confirm what was inserted
        const { data, error } = await supabaseClient
          .from('ASL-DataBase')
          .insert([gameData])
          .select();
        if (error) {
          console.error('Error inserting game data:', error);
        } else {
          console.log('Game data inserted:', data);
        }
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    }
  } else {
    console.warn("Offline mode: skipping DB write.");
  }
}

function drawGameOver() {
  buttons.forEach(btn => { btn.visible = false; });

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
  buttons
    .filter(btn => ["Restart", "Main Menu"].includes(btn.label))
    .forEach(btn => { btn.visible = true; btn.show(); });
}

function restartGame() {
  playerScore = 0;
  player.health = player.maxHealth; // Reset HP
  player.coins = 0; // Reset coins
  currentWord = random(words).toUpperCase().replace(/\s+/g, '');
  currentIndex = 0;
  startCountdown();
}

// ------------------------------------------------
// BUTTON CLASS
// ------------------------------------------------
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
    if (this.visible && this.isHovered()) {
      this.callback();
    }
  }
}

// ------------------------------------------------
// MOUSE CLICK
// ------------------------------------------------
function getVisibleButtons() {
  return buttons.filter(btn => btn.visible);
}
function mousePressed() {
  for (let btn of getVisibleButtons()) {
    if (btn.isHovered()) {
      btn.click();
      return;
    }
  }
}

// ------------------------------------------------
/* CALLBACKS */
// ------------------------------------------------
function gotHands(results) {
  hands = results;
}

async function gotClassification(results) {
  // Guard: empty or invalid results
  if (!results || results.length === 0) return;

  const sum = results.reduce((acc, r) => acc + (r?.confidence ?? 0), 0);
  if (!isFinite(sum) || sum <= 0) return; // nothing meaningful to use

  const normalized = results
    .map(r => ({ label: r.label, confidence: (r.confidence ?? 0) / sum }))
    .sort((a, b) => b.confidence - a.confidence);

  const top = normalized[0];
  if (!top || !isFinite(top.confidence)) return;

  // Require confidence threshold
  if (top.confidence >= 0.6) {
    const now = millis();

    // If word already complete (race condition), finalize immediately
    if (currentIndex >= currentWord.length) {
      finalizeWord();
      return;
    }

    const expectedLetter = currentWord[currentIndex];
    // If your model returns lowercase, compare case-insensitively:
    // if ((top.label ?? '').toUpperCase() === expectedLetter)
    if (top.label === expectedLetter && (now - lastMatchTime > 500)) {
      // Accept this letter
      currentIndex++;
      const timeTaken = now - letterStartTime;
      letterSpeeds.push(timeTaken);
      console.log(`Letter signed in ${(timeTaken / 1000).toFixed(2)} s`);
      letterStartTime = now; // start timing the next letter
      lastMatchTime = now;

      // If that was the last letter, finalize the word right now
      if (currentIndex >= currentWord.length) {
        finalizeWord();
      }
    }
  }
}

// Load in the buttons
function modelLoaded() {
  buttons.push(new Button(width / 2 - 100, height / 2 + 40, 200, 60, "Start Game", () => startCountdown()));
  buttons.push(new Button(width / 2 - 100, height / 2 + 200, 200, 60, "Exit", () => window.location.href = "../index.html"));
  // Add restart button for game over
  buttons.push(new Button(width / 2 - 100, height / 2 + 120, 200, 60, "Restart", () => restartGame()));
  buttons.push(new Button(width / 2 - 100, height / 2 + 200, 200, 60, "Main Menu", () => {
    currentState = "menu";
    playerScore = 0;
    player.health = player.maxHealth; // Reset HP
    player.coins = 0; // Reset coins
    currentWord = random(words).toUpperCase().replace(/\s+/g, '');
    currentIndex = 0;
  }));
  buttons.push(new Button(width / 2 - 100, height / 2 + 120, 200, 60, "Arduino", () => {
    currentState = "arduino";
  }));
  buttons.push(new Button(width / 2 - 100, height / 2 + 40, 200, 60, "Save Username", async () => {
    let newName = usernameInput.value().trim();
    if (newName.length > 10) {
      arduinoMessage = "Username too long! Max 10 characters.";
      arduinoMessageTime = millis();
      console.log(arduinoMessage);
      return; // Stop execution
    }
    player.name = newName;
    arduinoMessage = "Username saved!";
    arduinoMessageTime = millis();
    console.log("Username saved:", player.name);

    // Send updated name to Arduino if connected
    if (arduinoConnected && arduinoPort && arduinoPort.writable) {
      try {
        const writer = arduinoPort.writable.getWriter();
        let avgLetterSpeed = 0;
        if (wordSpeeds.length > 0) {
          let sum = wordSpeeds.reduce((a, b) => a + b, 0);
          avgLetterSpeed = (sum / wordSpeeds.length) / 1000;
        }
        const message = `${player.name},${avgLetterSpeed.toFixed(2)}\n`;
        await writer.write(new TextEncoder().encode(message));
        console.log("Updated Arduino with new name:", message);
        writer.releaseLock();
      } catch (err) {
        console.error("Error sending updated name to Arduino:", err);
      }
    }
  }));
  buttons.push(new Button(width / 2 - 100, height / 2 + 120, 200, 60, "Connect", () => {
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
          arduinoMessageTime = millis();
          currentState = "arduino";

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

          listenToArduino(); // Listen for button presses
        })
        .catch(err => {
          arduinoConnected = false;
          player.name = "Player" + floor(random(1000, 9999));
          usernameInput.value(player.name);
          usernameInput.hide();
          arduinoMessage = "Connection failed or wrong device.";
          arduinoMessageTime = millis();
          console.error(err);
        });
    } else {
      arduinoMessage = "Web Serial not supported.";
      arduinoMessageTime = millis();
    }
  }));
  buttons.push(new Button(width / 2 - 100, height / 2 + 120, 200, 60, "Disconnect", async () => {
    if (!arduinoPort) {
      arduinoMessage = "No device connected.";
      arduinoMessageTime = millis();
      return;
    }
    try {
      // 1) Send a friendly goodbye (optional)
      if (arduinoPort.writable) {
        const writer = arduinoPort.writable.getWriter();
        const message = `${player.name},0.00\n`;
        await writer.write(new TextEncoder().encode(message));
        writer.releaseLock();
      }

      // 2) Stop the read loop and cancel the same reader
      stopArduinoRead = true;
      if (arduinoReader) {
        try {
          await arduinoReader.cancel(); // causes read() to resolve with done=true
        } catch (e) {
          // Some browsers throw when canceling an already-stalled reader; safe to ignore
          console.debug("Reader cancel:", e?.message ?? e);
        }
        try { arduinoReader.releaseLock(); } catch {}
        arduinoReader = null;
      }

      // 3) Now close the port
      await arduinoPort.close();

      // 4) Reset state/UI
      arduinoConnected = false;
      arduinoPort = null;
      arduinoMessage = "Disconnected!";
      arduinoMessageTime = millis();
      currentState = "arduino";
      console.log("Arduino disconnected successfully.");
    } catch (err) {
      // Common messages: "NetworkError when attempting to fetch resource."
      // or "InvalidStateError: Cannot close a locked port." if reader wasn’t released
      console.error("Error disconnecting:", err);
      arduinoMessage = `Error disconnecting: ${err?.message ?? err}`;
      arduinoMessageTime = millis();

      // Fallback: ensure state isn’t stuck
      try {
        if (arduinoPort) await arduinoPort.close();
      } catch {}
      arduinoConnected = false;
      arduinoPort = null;
      arduinoReader = null;
    }
  }));
  buttons.push(new Button(width / 2 - 100, height / 2 + 200, 200, 60, "Back", () => {
    currentState = "menu";
  }));
  buttons.push(new Button(width / 2 - 120, height / 2 + 120, 240, 60, "Pay 1 Coin", () => {
    payCoinLogic();
  }));
}

// ------------------------------------------------
// HAND DATA
// ------------------------------------------------
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

  // --- Player "icon" (cyan) + name ---
  const nameY = HUD.y + HUD.height / 2 + 4;

  // Draw a simple cyan person icon (head + body)
  push();
  fill('cyan');
  noStroke();
  // head
  ellipse(HUD.x + 18, nameY - 4, 14, 14);
  // body (rounded rectangle)
  rect(HUD.x + 12, nameY + 3, 12, 10, 3);
  pop();

  // Draw name (white)
  fill(255);
  textAlign(LEFT, CENTER);
  textSize(20);
  text(player.name, HUD.x + 36, nameY);

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
    color(255, 0, 0),   // red
    color(255, 255, 0), // yellow
    frac < 0.5 ? frac * 2 : 1
  );
  const healthColor2 = lerpColor(
    color(255, 255, 0), // yellow
    color(0, 200, 0),   // green
    frac < 0.5 ? 0 : (frac - 0.5) * 2
  );
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

function resetWord() {
  currentWord = random(words).toUpperCase().replace(/\s+/g, '');
  currentIndex = 0;
  letterStartTime = millis(); // Start timing first letter
}

function finalizeWord() {
  if (finalizing) return; // guard against multiple triggers in same frame
  finalizing = true;

  // Compute and store average letter speed safely
  const sum = letterSpeeds.reduce((a, b) => a + b, 0);
  const count = Math.max(letterSpeeds.length, 1);
  const avg = sum / count;

  if (isFinite(avg)) {
    wordSpeeds.push(avg);
    console.log(`Average word signing speed: ${(avg / 1000).toFixed(2)} s`);
  } else {
    console.warn('Average speed was not finite; skipped storing.', { sum, count });
  }

  // Reset per-word stats
  letterSpeeds = [];
  playerScore++;

  // Reward coins based on word length (same logic you had)
  player.coins += currentWord.length <= 4 ? 1 : 2;

  // Send update to Arduino (safe try/catch)
  if (arduinoConnected && arduinoPort && arduinoPort.writable) {
    try {
      const writer = arduinoPort.writable.getWriter();
      const total = wordSpeeds.reduce((a, b) => a + b, 0);
      const avgLetterSpeed = (total / wordSpeeds.length) / 1000; // ms -> s
      const message = `${player.name},${avgLetterSpeed.toFixed(2)}\n`;
      writer.write(new TextEncoder().encode(message));
      console.log("Updated Arduino:", message);
      writer.releaseLock();
    } catch (err) {
      console.error("Error updating Arduino:", err);
    }
  }

  // Advance to a brand-new word and reset timing
  resetWord(); // sets currentWord/currentIndex and letterStartTime
  finalizing = false;
}

function payCoinLogic() {
  let requiredCoins = 5 + (checkpointsReached - 1) * 2;

  if (player.coins > 0) {
    player.coins -= 1;
    coinsPaid += 1;
    console.log(`Paid 1 coin. Total paid: ${coinsPaid}/${requiredCoins}`);

    if (coinsPaid >= requiredCoins) {
      coinsPaid = 0; // reset for next checkpoint
      pausedTime += millis() - checkpointStartTime;
      resetWord();
      currentState = "game"; // move on
    }
  } else {
    pausedTime += millis() - checkpointStartTime;
    console.log("No coins left! Applying penalty...");
    applyPenalty(requiredCoins - coinsPaid);
  }
}

// ------------------------------------------------
// ONLINE STATUS / OFFLINE BANNER (UI mirrors main.js)
// ------------------------------------------------
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
  textAlign(CENTER, CENTER);
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