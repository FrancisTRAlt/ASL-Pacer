
// ---------------- GLOBAL STATE ----------------
let video, handPose, hands = [];
let classifier;
let classification = "???";
let confidence = 0;
let connections;
let currentState = "menu";
let countdownStartTime = null;
let startTime = null;
let gameDuration = 60000;
let playerScore = 0;
let playerName = "";
let roomId = null;
let playerId = null;
let words = [];
let currentWord = "";
let currentIndex = 0;
let buttons = [];
let readyButton;
let roomInput;
let client;
let players = {}; // { playerId: { name, score, ready, lastUpdate } }
const brokerUrl = "wss://test.mosquitto.org:8081";
let clientId = `client_${Math.random().toString(16).slice(2)}`;
let errorMessage = "";
let errorTimer = 0;
const HEARTBEAT_INTERVAL = 10000; // 10s
const PLAYER_TIMEOUT = 30000; // 30s
let lastMatchTime = 0;



// ---------------- PRELOAD ----------------
function preload() {
  handPose = ml5.handPose({ flipped: true });
  words = loadStrings("../lib/words_alpha.txt");
}



// ---------------- SETUP ----------------
function setup() {
  createCanvas(800, 600);
  roomInput = createInput('');
  roomInput.hide();
  playerName = "Player" + floor(random(1000, 9999));
  video = createCapture(VIDEO, { flipped: true });
  video.size(800, 600);
  video.hide();
  ml5.setBackend("webgl");
  classifier = ml5.neuralNetwork({ task: "classification" });
  classifier.load({
    model: "../ml5Model/model.json",
    metadata: "../ml5Model/model_meta.json",
    weights: "../ml5Model/model.weights.bin",
  }, modelLoaded);
  handPose.detectStart(video, gotHands);
  connections = handPose.getConnections();
  setupMQTT();
  currentWord = random(words).toUpperCase();
  currentIndex = 0;
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  setInterval(cleanInactivePlayers, HEARTBEAT_INTERVAL);
}



// ---------------- MQTT SETUP ----------------

function setupMQTT() {
  client = mqtt.connect(brokerUrl, { clean: true });
  client.on("connect", () => console.log("Connected to MQTT broker"));
  client.on("message", handleMQTTMessage);
}



function handleMQTTMessage(topic, message) {
  try {
    const data = JSON.parse(message.toString());

    if (topic.endsWith("/players/update")) {
      const { playerId, name, score, ready, timestamp } = data;
      if (!playerId || !name) return;
      players[playerId] = { name, score, ready, lastUpdate: timestamp };

    } else if (topic.endsWith("/players")) {
      const snapshot = JSON.parse(message.toString());
      // Merge instead of overwrite
      players = { ...players, ...snapshot };

      if (Object.keys(players).length > 10) {
        alert("Room is full! Maximum 10 players allowed.");
        leaveRoom();
        return;
      }

    } else if (topic.endsWith("/start")) {
      restartGame();

    } else if (topic.endsWith("/ping")) {
      const { playerId, timestamp } = data;
      if (players[playerId]) players[playerId].lastUpdate = timestamp;
    }

  } catch (err) {
    console.error("Invalid MQTT message:", err);
  }
}





function sendHeartbeat() {
  if (!roomId || !playerId) return;
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
  if (removed) publishPlayers();
}



async function joinRoom(id) {
  if (!id) return;

  players = {};
  roomId = id;

  buttons = buttons.filter(btn => btn.label === "Main Menu");
  buttons.forEach(btn => { if (btn.label === "Main Menu") btn.visible = false; });

  currentState = "room";
  roomInput.hide();

  client.subscribe(`game/rooms/${roomId}/#`);

  // Wait briefly for snapshot before adding player
  await new Promise(resolve => setTimeout(resolve, 500));

  playerId = addPlayer(playerName);
  publishPlayers();
}





function addPlayer(name) {
  const id = `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
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




function publishPlayers() {
  client.publish(`game/rooms/${roomId}/players`, JSON.stringify(players), { retain: true });
}



function setReady() {
  if (!playerId || !players[playerId]) return;
  players[playerId].ready = !players[playerId].ready;
  readyButton.label = players[playerId].ready ? "Unready" : "Ready";

  client.publish(`game/rooms/${roomId}/players/update`, JSON.stringify({
    playerId,
    name: players[playerId].name,
    score: players[playerId].score,
    ready: players[playerId].ready,
    timestamp: Date.now()
  }));

  publishPlayers();

  if (Object.values(players).every(p => p.ready)) {
    client.publish(`game/rooms/${roomId}/start`, JSON.stringify({ timestamp: Date.now() }));
  }
}

function getRandomLetterAndNumber() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return "-"+result;
}

// ---------------- DRAW ----------------
function draw() {
  background(30);
  if (currentState === "menu") drawMenu();
  else if (currentState === "room") drawRoom();
  else if (currentState === "countdown") drawCountdown();
  else if (currentState === "game") drawGame();
  else if (currentState === "gameover") drawGameOver();
  drawPlayerCount();
}



// ---------------- MENU ----------------

function drawMenu() {
  background(30);
  if (errorMessage && millis() - errorTimer < 3000) {
    fill(255, 0, 0);
    textSize(20);
    text(errorMessage, width / 2, height / 2 - 100);
  }

  textAlign(CENTER, CENTER);
  textSize(36);
  fill(255);
  text("ASL Multiplayer Lobby", width / 2, height / 2 - 150);

  fill(50, 50, 50, 180);
  rect(width / 2 - 160, height / 2 - 80, 320, 180, 15);

  roomInput.position(width / 2 - 125, height / 2 - 40);
  roomInput.size(250);
  roomInput.show();

  // ✅ Ensure Join Room button exists
  if (!buttons.find(b => b.label === "Join Room")) {
    buttons.push(new Button(width / 2 - 155, height / 2 + 20, 150, 50, "Join Room", () => {
      const customCode = roomInput.value().trim();
      if (!customCode) {
        errorMessage = "Please enter a Room ID!";
        errorTimer = millis();
        return;
      } else {
        joinRoom(customCode);
      }
    }));
  }

  // ✅ Ensure Create Room button exists
  if (!buttons.find(b => b.label === "Create Room")) {
    buttons.push(new Button(width / 2 + 5, height / 2 + 20, 150, 50, "Create Room", () => {
      joinRoom("room" + getRandomLetterAndNumber());
    }));
  }

  buttons.forEach(btn => btn.show());
}


// ---------------- ROOM ----------------

function drawRoom() {
  textAlign(CENTER, TOP);
  textSize(32);
  fill(255);
  text(`Room: ${roomId}`, width / 2, 50);

  let y = 150;
  Object.values(players).forEach(p => {
    fill(p.ready ? "green" : "white");
    text(`${p.name} ${p.ready ? "(Ready)" : ""}`, width / 2, y);
    y += 40;
  });

  if (!readyButton) {
    readyButton = new Button(width / 2 - 100, height - 150, 200, 60, "Ready", setReady);
  }
  if (players[playerId]) readyButton.label = players[playerId].ready ? "Unready" : "Ready";
  readyButton.visible = true;
  readyButton.show();

  let leaveButton = new Button(width / 2 - 100, height - 80, 200, 50, "Leave", leaveRoom);
  if (!buttons.find(b => b.label === "Leave")) {
    buttons.push(leaveButton);
  }
  leaveButton.show();
}




function leaveRoom() {
  console.log("Leaving room...");

  if (playerId && players[playerId]) {
    delete players[playerId];
    publishPlayers();
  }

  if (client && roomId) {
    client.unsubscribe(`game/rooms/${roomId}/#`);
    console.log(`Unsubscribed from game/rooms/${roomId}/#`);
  }

  currentState = "menu";
  players = {};
  roomId = null;
  playerId = null;

  roomInput.hide();

  buttons = buttons.filter(btn => btn.label === "Main Menu");
  buttons.forEach(btn => { if (btn.label === "Main Menu") btn.visible = true; });

  readyButton = null;

  buttons.push(new Button(width / 2 - 155, height / 2 + 20, 150, 50, "Join Room", () => {
    const customCode = roomInput.value().trim();
    if (!customCode) {
      errorMessage = "Please enter a Room ID!";
      errorTimer = millis();
      return;
    } else {
      joinRoom(customCode);
    }
  }));
  buttons.push(new Button(width / 2 + 5, height / 2 + 20, 150, 50, "Create Room", () => {
    joinRoom("room" + getRandomLetterAndNumber());
  }));
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

function drawPlayerCount() {
  if (roomId) {
    textAlign(RIGHT, TOP);
    textSize(24);
    fill(255);
    text(`Players: ${Object.keys(players).length}`, width - 20, 20);
  }
}

// ---------------- GAME ----------------
function drawGame() {
  drawPixelatedVideo();
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
}

// ---------------- GAME OVER ----------------
function drawGameOver() {
  textAlign(CENTER, CENTER);
  fill(255);
  textSize(64);
  text("Game Over!", width / 2, 80);
  textSize(32);
  text("Players & Scores:", width / 2, 150);
  let y = 200;
  Object.values(players).forEach(p => {
    text(`${p.name} - ${p.score}`, width / 2, y);
    y += 40;
  });
  if (!readyButton) {
    readyButton = new Button(width / 2 - 100, height - 150, 200, 60, "Ready", setReady);
  }
  let player = Object.values(players).find(pl => pl.name === playerName);
  if (player) readyButton.label = player.ready ? "Unready" : "Ready";
  readyButton.visible = true;
  readyButton.show();
  let mainMenuButton = new Button(width / 2 - 100, height - 80, 200, 50, "Leave", () => {
    currentState = "menu";
    players = {};
    roomId = null;
    roomInput.hide();
    buttons.forEach(btn => btn.visible = true);
    readyButton = null;
  });
  mainMenuButton.show();
  if (mouseIsPressed) {
    mainMenuButton.click();
  }
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

    // Check if classification matches expected letter and cooldown passed
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
        currentWord = random(words).toUpperCase();
        currentIndex = 0;
      }
    }
  }
}


function modelLoaded() {
  buttons.push(new Button(width / 2 - 100, height / 2 + 150, 200, 60, "Main Menu", () => {
    window.location.href = "../index.html";
  }));
}

function startCountdown() {
  currentState = "countdown";
  countdownStartTime = millis();
}

function endGame() {
  currentState = "gameover";

  // Reset all players to not ready
  Object.values(players).forEach(p => p.ready = false);
  publishPlayers();

  // Reset readyButton label
  if (readyButton) readyButton.label = "Ready";
}

function restartGame() {
  currentState = "countdown";
  countdownStartTime = millis();
  playerScore = 0;
  Object.values(players).forEach(p => { p.ready = false; p.score = 0; });
  publishPlayers();
  currentWord = random(words).toUpperCase();
  currentIndex = 0;
  readyButton = null;
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