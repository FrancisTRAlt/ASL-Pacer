// --------------------- GLOBAL STATE ---------------------
// Hand detection
let video, handPose, hands = [];
let classifier;
let classification = "";
let confidence = 0;
let connections;
const fingers = {
  thumb: ["thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip"],
  index: ["index_finger_mcp", "index_finger_pip", "index_finger_dip", "index_finger_tip"],
  middle: ["middle_finger_mcp", "middle_finger_pip", "middle_finger_dip", "middle_finger_tip"],
  ring: ["ring_finger_mcp", "ring_finger_pip", "ring_finger_dip", "ring_finger_tip"],
  pinky: ["pinky_finger_mcp", "pinky_finger_pip", "pinky_finger_dip", "pinky_finger_tip"]
};

// Page status
let currentState = "menu";

// Game related
let countdownStartTime = null;
let startTime = null;
let gameDuration = 60000;
let playerScore = 0;
let playerName = "";
let words = [];
let currentWord = "";
let currentIndex = 0;

// MQTT
let client;
const brokerUrl = "wss://test.mosquitto.org:8081";
let clientId = `client_${Math.random().toString(16).slice(2)}`;
let roomId = null; //ID of the room
let playerId = null; //Player UNIQUE id in case of dup
let players = {}; // { playerId: { name, score, ready, lastUpdate } }

let buttons = [];
let readyButton;
let roomInput;

const HEARTBEAT_INTERVAL = 10000; // 10s
const PLAYER_TIMEOUT = 60000; // 60s

let lastMatchTime = 0;
let gameState = "waiting";

// ---- MULTI-HAND STREAMING
const HAND_FPS = 10;            // publish ~10 frames per second
const HAND_STALE_MS = 2000;     // hide remote hand if older than 2s
let lastHandPublishAt = 0;

const playerColors = {};

// error display
let errorMessage = "";
let errorTimer = 0;

// Username input + info message
let usernameInput;    // input box for username in menu
let infoMessage = ""; // green success/info text
let infoTimer = 0;





// --------------------- PRELOAD ---------------------
function preload() {
  handPose = ml5.handPose({ flipped: true });
  words = loadStrings("../lib/words_alpha.txt");
}



// --------------------- SETUP ---------------------
function setup() {
  createCanvas(800, 600);

  // Room code input
  roomInput = createInput('');
  roomInput.attribute('placeholder', 'Enter Code');
  roomInput.hide();
  roomInput.position((width - roomInput.width) / 2, height / 2 - 40);
  roomInput.style('padding', '10px');
  roomInput.style('font-size', '18px');
  roomInput.style('border', '2px solid #ccc');
  roomInput.style('border-radius', '8px');
  roomInput.style('outline', 'none');
  roomInput.style('color', '#333');
  roomInput.style('background-color', '#f9f9f9');
  roomInput.style('box-sizing', 'border-box');
  roomInput.style('width', '250px');

  // Username input (same style as roomInput) ---
  usernameInput = createInput('');
  usernameInput.attribute('placeholder', 'Enter Username');
  usernameInput.hide();
  usernameInput.style('padding', '10px');
  usernameInput.style('font-size', '18px');
  usernameInput.style('border', '2px solid #ccc');
  usernameInput.style('border-radius', '8px');
  usernameInput.style('outline', 'none');
  usernameInput.style('color', '#333');
  usernameInput.style('background-color', '#f9f9f9');
  usernameInput.style('box-sizing', 'border-box');
  usernameInput.style('width', '250px');

  // Default randomized player name
  playerName = "Player" + floor(random(1000, 9999));
  usernameInput.value(playerName); // prefill

  video = createCapture(VIDEO, { flipped: true });
  video.size(800, 600);
  video.hide();

  // Get the ML model
  ml5.setBackend("webgl");
  classifier = ml5.neuralNetwork({ task: "classification" });
  classifier.load({
    model: "../ml5Model/model.json",
    metadata: "../ml5Model/model_meta.json",
    weights: "../ml5Model/model.weights.bin",
  }, modelLoaded);

  // Get the handpose
  handPose.detectStart(video, gotHands);
  connections = handPose.getConnections();

  setupMQTT(); // MQTT for online connection

  // Other
  currentWord = random(words).toUpperCase().replace(/\s+/g, '');
  currentIndex = 0;
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  setInterval(cleanInactivePlayers, HEARTBEAT_INTERVAL);
}



// --------------------- DRAW ---------------------
function draw() {
  drawSpaceBackground(); // Black background with stars
  if (currentState === "menu") drawMenu();
  else if (currentState === "room") drawRoom(); // Lobby
  // Enter the Game
  else if (currentState === "countdown") drawCountdown();
  else if (currentState === "game") drawGame();
  else if (currentState === "gameover") drawGameOver();
  // Draw player's hand
  if (roomId && (currentState === "room" || currentState === "game")) maybePublishHand();
  drawPlayerCount();
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



// --------------------- MENU ---------------------
function drawMenu() {
  drawSpaceBackground();

  // Error (red) for 3s
  if (errorMessage && millis() - errorTimer < 3000) {
    fill(255, 0, 0);
    textSize(20);
    text(errorMessage, width / 2, height / 2 - 140);
  }

  // Info (green) for 2s
  if (infoMessage && millis() - infoTimer < 2000) {
    fill(0, 200, 0);
    textSize(20);
    text(infoMessage, width / 2, height / 2 - 140);
  }

  textAlign(CENTER, CENTER);
  textSize(36);
  fill(255);
  text("ASL Multiplayer Lobby", width / 2, height / 2 - 180);

  // Panel
  fill(50, 50, 50, 180);
  rect(width / 2 - 160, height / 2 - 120, 320, 290, 15);

  // Username label + input positioning
  textSize(20);
  fill(200);
  text("Username", width / 2, height / 2 - 95);

  usernameInput.position(width / 2 - 125, height / 2 - 80);
  usernameInput.size(250);
  usernameInput.show();

  // Save Username button
  if (!buttons.find(b => b.label === "Save Username")) {
    buttons.push(new Button(
      width / 2 - 100,
      height / 2 - 30,
      200,
      40,
      "Save Username",
      saveUsername
    ));
  }

  // Room Code label + input
  textSize(20);
  fill(200);
  text("Room Code", width / 2, height / 2 + 30);

  roomInput.position(width / 2 - 125, height / 2 + 45);
  roomInput.size(250);
  roomInput.show();

  // Join Room button
  if (!buttons.find(b => b.label === "Join Room")) {
    buttons.push(new Button(width / 2 - 155, height / 2 + 100, 150, 50, "Join Room", () => {
      const customCode = roomInput.value().trim();

      // Optional: require a valid username before joining
      if (!/^[A-Za-z0-9_]{3,16}$/.test(playerName)) {
        errorMessage = "Set a valid username first (3–10 chars).";
        errorTimer = millis();
        return;
      }

      if (!customCode) {
        errorMessage = "Please enter a Room ID!";
        errorTimer = millis();
        return;
      } else {
        joinRoom(customCode); // Join existing room only
      }
    }));
  }

  // Create Room button
  if (!buttons.find(b => b.label === "Create Room")) {
    buttons.push(new Button(width / 2 + 5, height / 2 + 100, 150, 50, "Create Room", () => {
      // Optional: require a valid username before creating
      if (!/^[A-Za-z0-9_]{3,10}$/.test(playerName)) {
        errorMessage = "Set a valid username first (3–10 chars).";
        errorTimer = millis();
        return;
      }
      createRoom();
    }));
  }

  // Draw buttons
  buttons.forEach(btn => btn.show());
}


// --------------------- ROOM ---------------------
function drawRoom() {
  textAlign(CENTER, TOP);
  textSize(32);
  fill(255);
  text(`Code: ${roomId}`, width / 2, 50);

  let y = 150;
  const activePlayers = Object.values(players);
  if (activePlayers.length === 0) {
    textSize(24);
    fill(255, 0, 0);
    text("Waiting for players...", width / 2, height / 2);
  } else {
    activePlayers.forEach(p => {
      fill(p.ready ? "green" : "white");
      text(`${p.name} ${p.ready ? "(Ready)" : ""}`, width / 2, y);
      y += 40;
    });

    if (!readyButton) {
      readyButton = new Button(width / 2 - 100, height - 150, 200, 60, "Ready", setReady);
    }
    if (players[playerId]) {
      readyButton.label = players[playerId].ready ? "Unready" : "Ready";
    }
    readyButton.visible = true;
    readyButton.show();

    let leaveButton = new Button(width / 2 - 100, height - 80, 200, 50, "Leave", leaveRoom);
    if (!buttons.find(b => b.label === "Leave")) {
      buttons.push(leaveButton);
    }
    leaveButton.show();
    drawAllHands();
  }
}

function drawPlayerCount() {
  if (roomId) {
    textAlign(RIGHT, TOP);
    textSize(24);
    fill(255);
    text(`Players: ${Object.keys(players).length} / 5`, width - 20, 20);
  }
}



// --------------------- COUNTDOWN ---------------------
function startCountdown() {
  currentState = "countdown";
  countdownStartTime = millis();
}

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



// --------------------- GAME ---------------------
function drawGame() {
  if (hands.length > 0) {
    drawHandSkeleton(hands[0], fingers);
  }

  if (millis() - startTime >= gameDuration) {
    endGame();
    return;
  }

  if (hands[0]) {
    let inputData = flattenHandData();
    classifier.classify(inputData, gotClassification);
  }

  fill("black");
  rect(width / 2 - 350, height / 2 + 20, 700, 350, 20);

  let boxCenterX = width / 2;
  let boxCenterY = height / 2 + 190;

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
  let elapsed = millis() - startTime;
  let seconds = floor(elapsed / 1000);
  let minutes = floor(seconds / 60);
  seconds = seconds % 60;
  let timerText = nf(minutes, 2) + ":" + nf(seconds, 2);
  textSize(32);
  fill(255);
  text(timerText, boxCenterX - 280, boxCenterY - 120);

  textAlign(CENTER, CENTER);
  textSize(64);
  fill(0, 255, 0);
  text(classification, boxCenterX, boxCenterY - 100);
  classification = "";
  drawAllHands();
}

// --------------------- GAME OVER ---------------------
function endGame() {
  currentState = "gameover";
  // Reset readiness for all players
  Object.values(players).forEach(p => p.ready = false);
  publishPlayers();

  // Update MQTT state to "gameover" instead of "waiting"
  client.publish(`game/rooms/${roomId}/state`, JSON.stringify({ state: "gameover" }), { retain: true });
  gameState = "gameover";

  // Reset Ready button label
  if (readyButton) readyButton.label = "Ready";
}

function drawGameOver() {
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(64);
  text("Game Over!", width / 2, 80);

  textSize(32);
  text("Players & Scores:", width / 2, 150);

  let y = 200;
  Object.values(players).forEach(p => {
    if (p.left) {
      fill("red");
      text(`${p.name} (Disconnected) - ${p.score}`, width / 2, y);
    } else {
      fill(p.ready ? "green" : "white");
      text(`${p.name} - ${p.score}`, width / 2, y);
    }
    y += 40;
  });

  if (!readyButton) {
    readyButton = new Button(width / 2 - 100, height - 150, 200, 60, "Ready", setReady);
  }
  let player = Object.values(players).find(pl => pl.name === playerName);
  if (player) readyButton.label = player.ready ? "Unready" : "Ready";
  readyButton.visible = true;
  readyButton.show();

  let leaveButton = buttons.find(b => b.label === "Leave");
  if (!leaveButton) {
    leaveButton = new Button(width / 2 - 100, height - 80, 200, 50, "Leave", leaveRoom);
    buttons.push(leaveButton);
  }
  leaveButton.show();
}

function restartGame() {
  currentState = "countdown";
  countdownStartTime = millis();

  // Remove disconnected players
  for (let id in players) {
    if (players[id].left) {
      delete players[id];
    }
  }

  playerScore = 0;
  Object.values(players).forEach(p => {
    p.ready = false;
    p.score = 0;
  });

  publishPlayers();
  client.publish(`game/rooms/${roomId}/state`, JSON.stringify({ state: "in-progress" }), { retain: true });
  gameState = "in-progress";

  currentWord = random(words).toUpperCase().replace(/\s+/g, '');
  currentIndex = 0;

  readyButton = null;
  buttons = buttons.filter(btn => btn.label === "Main Menu");
}



// --------------------- MQTT SETUP ---------------------
function setupMQTT() { // Connect to the broker
  client = mqtt.connect(brokerUrl, { clean: true });
  client.on("connect", () => console.log("Connected to MQTT broker"));
  client.on("message", handleMQTTMessage);
}

function handleMQTTMessage(topic, message) { // This handles players if they are in the same broker
  try {
    const data = JSON.parse(message.toString());
    if (topic.endsWith("/players/update")) {
      const { playerId, name, score, ready, left, timestamp } = data;
      if (!playerId || !name) return;
      players[playerId] = { name, score, ready, left: !!left, lastUpdate: timestamp };
    } else if (topic.endsWith("/players")) {
      const snapshot = JSON.parse(message.toString());
      const cleanSnapshot = {};
      for (let id in snapshot) {
        const p = snapshot[id];
        if (p && p.name) {
          cleanSnapshot[id] = {
            name: p.name,
            score: p.score || 0,
            ready: !!p.ready,
            left: !!p.left,
            lastUpdate: p.lastUpdate || Date.now()
          };
        }
      }
      players = cleanSnapshot; // Replace instead of merge. We want the player name to be seperate and not updating one over the other
      redraw(); // Force UI refresh

    } else if (topic.endsWith("/start")) { // If all players want to start
      restartGame(); // All clients restart together
    } else if (topic.endsWith("/ping")) {
      const { playerId, timestamp } = data;
      if (players[playerId]) players[playerId].lastUpdate = timestamp;
    } else if (topic.endsWith("/state")) {
      const { state } = data;
      gameState = state;
    } else if (topic.includes("/hands/")) {
      const data = JSON.parse(message.toString());
      const senderId = data.playerId;
      if (!senderId || senderId === playerId) return;

      if (!players[senderId]) {
        players[senderId] = { name: `Player?`, score: 0, ready: false, lastUpdate: Date.now() };
      }

      players[senderId].remoteHand = { data: denormalizeHandForDraw(data.hand), ts: data.ts || Date.now() };
      players[senderId].lastUpdate = data.ts || Date.now();
    }
  } catch (err) {
    console.error("Invalid MQTT message:", err);
  }
}

function sendHeartbeat() {
  if (!roomId || !playerId || currentState === "menu") return; // Prevent sending in menu
  client.publish(`game/rooms/${roomId}/ping`, JSON.stringify({
    playerId,
    timestamp: Date.now()
  }));
}

function cleanInactivePlayers() {
  const now = Date.now();
  let removed = false;
  for (let id in players) {
    if (now - players[id].lastUpdate > PLAYER_TIMEOUT) {
      delete players[id];
      removed = true;
    }
  }
  if (removed) {
    publishPlayers(); // Always publish clean snapshot
    if (Object.keys(players).length === 0 && client && roomId) {
      client.publish(`game/rooms/${roomId}/players`, "", { retain: true });
      console.log(`Room ${roomId} cleared from MQTT due to inactivity`);
    }
  }
}



// --------------------- ROOM SETTINGS ---------------------
async function joinRoom(id) { // Joining a room
  if (!id) return;
  players = {};
  roomId = id;

  gameState = "waiting";

  // Keep only Main Menu button; hide it in room.
  buttons = buttons.filter(btn => btn.label === "Main Menu");
  buttons.forEach(btn => { if (btn.label === "Main Menu") btn.visible = false; });

  currentState = "room";
  roomInput.hide();
  usernameInput.hide(); // hide username input in room state

  client.subscribe(`game/rooms/${roomId}/#`);
  client.subscribe(`game/rooms/${roomId}/state`);

  await new Promise(resolve => setTimeout(resolve, 500));


  if (gameState !== "waiting") { // If the game is in progress, do not join
    errorMessage = "Game is in progress";
    errorTimer = millis();
    currentState = "menu";
    leaveRoom();
    return;
  }

  if (Object.keys(players).length === 0) { // if the room has 0 players to start off, it does not exist
    errorMessage = "Room does not exist!";
    errorTimer = millis();
    currentState = "menu";
    leaveRoom();
    return;
  }

  // Otherwise, join the room
  client.subscribe(`game/rooms/${roomId}/hands/#`);
  playerId = addPlayer(playerName);
  publishPlayers();
}

function createRoom() { // Creating your room
  roomId = "room" + getRandomLetterAndNumber(); // Random generated room ID
  players = {};

  gameState = "waiting";

  // Hide the main menu button
  buttons = buttons.filter(btn => btn.label === "Main Menu");
  buttons.forEach(btn => { if (btn.label === "Main Menu") btn.visible = false; });

  currentState = "room";
  roomInput.hide();
  usernameInput.hide(); // hide username input in room state

  // We are in a room that has one player (Yourself)
  client.subscribe(`game/rooms/${roomId}/#`);
  client.subscribe(`game/rooms/${roomId}/hands/#`);
  playerId = addPlayer(playerName);
  publishPlayers();
}

function leaveRoom() {
  console.log("Leaving room...");
  if (playerId && players[playerId]) {
    if (currentState === "gameover") {
      players[playerId].left = true; // Mark disconnected
      publishPlayers();
    } else {
      delete players[playerId];
      publishPlayers();
    }
  }

  const activePlayers = Object.values(players).filter(p => !p.left);
  if (activePlayers.length === 0 && client && roomId) {
    client.publish(`game/rooms/${roomId}/players`, "", { retain: true });
    console.log(`Room ${roomId} cleared from MQTT`);
  }

  if (client && roomId) {
    client.unsubscribe(`game/rooms/${roomId}/#`);
    client.unsubscribe(`game/rooms/${roomId}/hands/#`);
  }
  
  gameState = "waiting";
  for (let id in players) {
    if (players[id]) {
      players[id].remoteHand = null; // clear remote hand data
    }
  }

  currentState = "menu";
  roomId = null;
  playerId = null;
  roomInput.hide();

  // Return to menu: show Main Menu button
  buttons = buttons.filter(btn => btn.label === "Main Menu");
  buttons.forEach(btn => { if (btn.label === "Main Menu") btn.visible = true; });

  readyButton = null;
  redraw(); // Immediate UI refresh
}

function getRandomLetterAndNumber() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return "-" + result;
}



// --------------------- PLAYER SETTINGS ---------------------
function addPlayer(name) { // Add the player to the room with their data
  const id = `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`; //Player ID
  players[id] = { name, score: 0, ready: false, lastUpdate: Date.now() };
  client.publish(`game/rooms/${roomId}/players/update`, JSON.stringify({
    playerId: id,
    name,
    score: 0,
    ready: false,
    timestamp: Date.now()
  }));
  return id;
}

function publishPlayers() { // Player Status shared through MQTT
  const cleanPlayers = {};
  for (let id in players) {
    const p = players[id];
    if (p && p.name) {
      cleanPlayers[id] = {
        name: p.name,
        score: p.score || 0,
        ready: !!p.ready,
        left: !!p.left,
        lastUpdate: p.lastUpdate || Date.now()
      };
    }
  }
  client.publish(`game/rooms/${roomId}/players`, JSON.stringify(cleanPlayers), { retain: true });
}

// Save & validate username, propagate if in a room
function saveUsername() {
  const newName = usernameInput.value().trim();

  // Validation: 3–10 chars, letters/numbers/_ only
  const valid = /^[A-Za-z0-9_]{3,10}$/.test(newName);
  if (!valid) {
    errorMessage = "Username must be 3–10 chars (letters, numbers, or _)";
    errorTimer = millis();
    return;
  }

  // Apply locally
  playerName = newName;

  // If already in a room, propagate the change over MQTT
  if (roomId && playerId && players[playerId]) {
    players[playerId].name = newName;

    // publish an update for this player
    client.publish(`game/rooms/${roomId}/players/update`, JSON.stringify({
      playerId,
      name: newName,
      score: players[playerId].score || 0,
      ready: !!players[playerId].ready,
      left: !!players[playerId].left,
      timestamp: Date.now()
    }));

    // publish full snapshot so everyone refreshes
    publishPlayers();
  }

  // Show a brief confirmation in menu
  infoMessage = "Username saved!";
  infoTimer = millis();
}

function setReady() { // set the player ready if they are ready
  if (!playerId || !players[playerId]) return;
  players[playerId].ready = !players[playerId].ready;
  readyButton.label = players[playerId].ready ? "Unready" : "Ready";
  client.publish(`game/rooms/${roomId}/players/update`, JSON.stringify({
    playerId,
    name: players[playerId].name,
    score: players[playerId].score,
    ready: players[playerId].ready,
    left: !!players[playerId].left,
    timestamp: Date.now()
  }));
  publishPlayers();

  const activePlayers = Object.values(players).filter(p => !p.left);
  if (gameState === "waiting" || gameState === "gameover") {
    if (activePlayers.length > 0 && activePlayers.every(p => p.ready)) {
      client.publish(`game/rooms/${roomId}/start`, JSON.stringify({ timestamp: Date.now() }));
    }
  }
}



// --------------------- BUTTON CLASS ---------------------
class Button {
  constructor(x, y, w, h, label, callback) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.label = label;
    this.callback = callback;
    this.visible = true;
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

function mousePressed() {
  for (let btn of buttons) {
    if (btn.visible && btn.isHovered()) {
      btn.click();
      return;
    }
  }
  if (readyButton && readyButton.visible && readyButton.isHovered()) {
    readyButton.click();
  }
}



// --------------------- CALLBACKS ---------------------
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
      classification = ""; // Reset to prevent repeated triggers

      if (currentIndex >= currentWord.length) {
        playerScore++;
        let player = Object.values(players).find(p => p.name === playerName);
        if (player) player.score = playerScore;
        publishPlayers();

        // Load next word
        currentWord = random(words).toUpperCase().replace(/\s+/g, '');
        currentIndex = 0;
      }
    }
  }
}

function modelLoaded() { // Only loads in the main menu button
  buttons.push(new Button(width / 2 - 100, height / 2 + 190, 200, 60, "Main Menu", () => {
    window.location.href = "../index.html";
  }));
}



// --------------------- HAND DATA ---------------------
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

function getPlayerColor(id) {
  if (!playerColors[id]) {
    playerColors[id] = color(random(60, 255), random(60, 255), random(60, 255));
  }
  return playerColors[id];
}

function normalizeHandForSend(hand) {
  if (!hand || !hand.keypoints) return null;
  const named = {};
  for (const kp of hand.keypoints) {
    const name = kp.name || kp.part || kp.index;
    if (typeof name === 'string') {
      named[name] = { x: +(kp.x / video.width).toFixed(3), y: +(kp.y / video.height).toFixed(3) };
    }
  }
  return named;
}

function denormalizeHandForDraw(norm) {
  if (!norm) return null;
  const obj = {};
  for (const name in norm) {
    const n = norm[name];
    obj[name] = { x: n.x * video.width, y: n.y * video.height };
  }
  obj.keypoints = Object.keys(obj).map(name => ({ x: obj[name].x, y: obj[name].y }));
  return obj;
}



function publishHand() {
  if (!client || !roomId || !playerId) return;
  if (!hands || !hands[0]) return;

  const norm = normalizeHandForSend(hands[0]);
  if (!norm) return;

  client.publish(`game/rooms/${roomId}/hands/${playerId}`, JSON.stringify({
    playerId, hand: norm, ts: Date.now()
  }));
}

function maybePublishHand() {
  const now = millis();
  if (now - lastHandPublishAt < 1000 / HAND_FPS) return;
  lastHandPublishAt = now;
  publishHand();
}


function drawHandSkeletonColored(hand, fingers, pointColor, lineColor, nameLabel) {
  const mapPt = (name) => {
    const pt = hand[name];
    if (!pt) return null;
    const x = map(pt.x, 0, video.width, 0, width);
    const y = map(pt.y, 0, video.height, 0, height);
    return { x, y };
  };

  noStroke();
  fill(pointColor || 'cyan');
  for (const name in hand) {
    const p = mapPt(name);
    if (!p) continue;
    ellipse(p.x, p.y, 12, 12);
  }

  stroke(lineColor || 255);
  strokeWeight(2);
  for (const finger in fingers) {
    const chain = fingers[finger].map(mapPt).filter(Boolean);
    for (let i = 0; i < chain.length - 1; i++) {
      line(chain[i].x, chain[i].y, chain[i + 1].x, chain[i + 1].y);
    }
  }

  if (nameLabel) {
    const wrist = mapPt("wrist");
    if (wrist) {
      noStroke();
      fill(255);
      textSize(14);
      text(nameLabel, wrist.x + 10, wrist.y - 10);
    }
  }
}

function drawAllHands() {
  if (hands.length > 0 && hands[0]) {
    drawHandSkeletonColored(hands[0], fingers, 'cyan', 255, playerName);
  }
  const now = Date.now();
  for (const id in players) {
    if (id === playerId) continue;
    const p = players[id];
    if (!p || !p.remoteHand || !p.remoteHand.data) continue;
    if (now - p.remoteHand.ts > HAND_STALE_MS) continue;
    const col = getPlayerColor(id);
    drawHandSkeletonColored(p.remoteHand.data, fingers, col, col, p.name);
  }
}