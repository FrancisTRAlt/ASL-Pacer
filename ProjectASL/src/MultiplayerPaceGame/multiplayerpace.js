
/**
 * ASL Multiplayer (p5.js + ml5.js + MQTT over WebSockets)
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * MQTT (as used in this code)
 * - Clients connect to a broker (here: test.mosquitto.org via WSS).
 * - You PUBLISH messages to string "topics" (e.g., "game/rooms/ROOM_ID/players").
 * - Other clients SUBSCRIBE to topics to receive those messages.
 * - "Retained" messages (retain: true) persist at the broker; new subscribers
 *   immediately receive the last retained message. We use that for room snapshots.
 * - We use several topics:
 *     game/rooms/{roomId}/players          → retained snapshot of all players
 *     game/rooms/{roomId}/players/update   → individual player updates (non-retained)
 *     game/rooms/{roomId}/ping             → heartbeats to mark presence
 *     game/rooms/{roomId}/start            → signal to start a new round
 *     game/rooms/{roomId}/state            → game state sync ("waiting", "in-progress", "gameover")
 *     game/rooms/{roomId}/hands/{playerId} → throttled hand pose stream (~10 FPS)
 * - Heartbeats (periodic "ping") update each player's last seen time; we remove
 *   players that timeout (no heartbeat).
 * - Hand data is normalized to video size for transport; receivers denormalize
 *   and draw in their local canvas.
 * ───────────────────────────────────────────────────────────────────────────────
 */

// ------------------------------ GLOBAL STATE ----------------------------------
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

// ------------------------------- MQTT -----------------------------------------
// IMPORTANT: This expects the MQTT client (browser) library loaded in HTML,
// e.g. https://unpkg.com/mqtt/dist/mqtt.min.js</script>
let client;
const brokerUrl = "wss://test.mosquitto.org:8081"; // Public test broker over WebSocket Secure
let clientId = `client_${Math.random().toString(16).slice(2)}`;
let roomId = null;    // The room code (string)
let playerId = null;  // Unique player ID in room
let players = {};     // { playerId: { name, score, ready, left?, lastUpdate, remoteHand? } }
let buttons = [];
let readyButton;
let roomInput;

const HEARTBEAT_INTERVAL = 10000; // 10s heartbeat to mark active players
const PLAYER_TIMEOUT = 60000;     // 60s inactivity → remove player

let lastMatchTime = 0;
let gameState = "waiting";

// ---- Multi-hand streaming over MQTT ------------------------------------------
const HAND_FPS = 10;        // publish ~10 frames per second
const HAND_STALE_MS = 2000; // hide remote hand if older than 2s
let lastHandPublishAt = 0;
const playerColors = {};

// Error / info display
let errorMessage = "";
let errorTimer = 0;
let usernameInput; // input box for username in menu
let infoMessage = ""; // green success/info text
let infoTimer = 0;

// ------------------------------- PRELOAD ---------------------------------------
function preload() {
  // ml5 HandPose model (flipped for webcam mirror effect)
  handPose = ml5.handPose({ flipped: true });
  // Load word list
  words = loadStrings("../lib/words_alpha.txt");
}

// --------------------------------- SETUP ---------------------------------------
function setup() {
  createCanvas(800, 600);

  // ----- UI: Room code input -----
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

  // ----- UI: Username input -----
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

  // Webcam capture
  video = createCapture(VIDEO, { flipped: true });
  video.size(800, 600);
  video.hide();

  // ML backend + classifier
  ml5.setBackend("webgl");
  classifier = ml5.neuralNetwork({ task: "classification" });
  classifier.load({
    model: "../ml5Model/model.json",
    metadata: "../ml5Model/model_meta.json",
    weights: "../ml5Model/model.weights.bin",
  }, modelLoaded);

  // Start handpose detection
  handPose.detectStart(video, gotHands);
  connections = handPose.getConnections();

  // ----- MQTT connection -----
  setupMQTT();

  // Game word prepare
  currentWord = random(words).toUpperCase().replace(/\s+/g, '');
  currentIndex = 0;

  // Heartbeat & cleanup loops
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  setInterval(cleanInactivePlayers, HEARTBEAT_INTERVAL);
}

// ---------------------------------- DRAW ---------------------------------------
function draw() {
  drawSpaceBackground(); // Black background with stars

  // State machine
  if (currentState === "menu")      drawMenu();
  else if (currentState === "room") drawRoom();      // Lobby
  else if (currentState === "countdown") drawCountdown();
  else if (currentState === "game") drawGame();
  else if (currentState === "gameover") drawGameOver();

  // Publish our hand stream only when in a room or game
  if (roomId && (currentState === "room" || currentState === "game")) {
    maybePublishHand();
  }

  // HUD: player count
  drawPlayerCount();
}

// ------------------------ Background: star field --------------------------------
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

// ---------------------------------- MENU ----------------------------------------
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

// --------------------------------- ROOM (Lobby) --------------------------------
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

    // Ready button
    if (!readyButton) {
      readyButton = new Button(width / 2 - 100, height - 150, 200, 60, "Ready", setReady);
    }
    if (players[playerId]) {
      readyButton.label = players[playerId].ready ? "Unready" : "Ready";
    }
    readyButton.visible = true;
    readyButton.show();

    // Leave button
    let leaveButton = new Button(width / 2 - 100, height - 80, 200, 50, "Leave", leaveRoom);
    if (!buttons.find(b => b.label === "Leave")) {
      buttons.push(leaveButton);
    }
    leaveButton.show();

    // Draw our and remote hands
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

// ------------------------------ COUNTDOWN --------------------------------------
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

// ----------------------------------- GAME --------------------------------------
function drawGame() {
  // Draw local hand skeleton if present
  if (hands.length > 0) {
    drawHandSkeleton(hands[0], fingers);
  }

  // End after duration
  if (millis() - startTime >= gameDuration) {
    endGame();
    return;
  }

  // Classify current hand pose for letter
  if (hands[0]) {
    let inputData = flattenHandData();
    classifier.classify(inputData, gotClassification);
  }

  // UI container
  fill("black");
  rect(width / 2 - 350, height / 2 + 20, 700, 350, 20);
  let boxCenterX = width / 2;
  let boxCenterY = height / 2 + 190;

  // Draw target word with glow for matched letters
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

  // Classification feedback
  textAlign(CENTER, CENTER);
  textSize(64);
  fill(0, 255, 0);
  text(classification, boxCenterX, boxCenterY - 100);
  classification = ""; // clear after display

  // Show all hands (local + remote)
  drawAllHands();
}

// ------------------------------ GAME OVER --------------------------------------
function endGame() {
  currentState = "gameover";

  // Reset readiness for all players
  Object.values(players).forEach(p => p.ready = false);
  publishPlayers();

  // Set MQTT state to "gameover" (retained so everyone sees consistent state)
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

  // Ready button (to restart)
  if (!readyButton) {
    readyButton = new Button(width / 2 - 100, height - 150, 200, 60, "Ready", setReady);
  }
  let player = Object.values(players).find(pl => pl.name === playerName);
  if (player) readyButton.label = player.ready ? "Unready" : "Ready";
  readyButton.visible = true;
  readyButton.show();

  // Leave button
  let leaveButton = buttons.find(b => b.label === "Leave");
  if (!leaveButton) {
    leaveButton = new Button(width / 2 - 100, height - 80, 200, 50, "Leave", leaveRoom);
    buttons.push(leaveButton);
  }
  leaveButton.show();
}

// Restart round across all clients (triggered by MQTT "start")
function restartGame() {
  currentState = "countdown";
  countdownStartTime = millis();

  // Remove disconnected players
  for (let id in players) {
    if (players[id].left) {
      delete players[id];
    }
  }

  // Reset local score + all readiness and scores
  playerScore = 0;
  Object.values(players).forEach(p => {
    p.ready = false;
    p.score = 0;
  });
  publishPlayers();

  // Broadcast "in-progress"
  client.publish(`game/rooms/${roomId}/state`, JSON.stringify({ state: "in-progress" }), { retain: true });
  gameState = "in-progress";

  // New word
  currentWord = random(words).toUpperCase().replace(/\s+/g, '');
  currentIndex = 0;

  // Clean lobby buttons
  readyButton = null;
  buttons = buttons.filter(btn => btn.label === "Main Menu");
}

// ------------------------------ MQTT SETUP -------------------------------------
function setupMQTT() {
  // Connect to the broker.
  // "clean: true" means the broker will not keep session state on disconnect.
  client = mqtt.connect(brokerUrl, { clean: true });

  // Connection event
  client.on("connect", () => console.log("Connected to MQTT broker"));

  // Route all incoming messages to our handler
  client.on("message", handleMQTTMessage);
}

/**
 * Handle inbound MQTT messages per topic.
 * This is the core "subscribe" path for room synchronization.
 */
function handleMQTTMessage(topic, message) {
  try {
    const data = JSON.parse(message.toString());

    if (topic.endsWith("/players/update")) {
      // Merge a single player's update into local state
      const { playerId, name, score, ready, left, timestamp } = data;
      if (!playerId || !name) return;
      players[playerId] = { name, score, ready, left: !!left, lastUpdate: timestamp };

    } else if (topic.endsWith("/players")) {
      // Full retained snapshot: replace local players with broker snapshot
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
      // Replace instead of merge so we stay consistent with the retained snapshot
      players = cleanSnapshot;
      redraw(); // Force UI refresh

    } else if (topic.endsWith("/start")) {
      // All players ready → broker sends start → all clients restart simultaneously
      restartGame();

    } else if (topic.endsWith("/ping")) {
      // Heartbeat from any player → update last seen
      const { playerId, timestamp } = data;
      if (players[playerId]) players[playerId].lastUpdate = timestamp;

    } else if (topic.endsWith("/state")) {
      // Sync room game state
      const { state } = data;
      gameState = state;

    } else if (topic.includes("/hands/")) {
      // Hand streaming (remote players)
      const senderId = data.playerId;
      if (!senderId || senderId === playerId) return; // ignore our own stream

      if (!players[senderId]) {
        // Create a placeholder for unknown player so we can show their hand
        players[senderId] = { name: `Player?`, score: 0, ready: false, lastUpdate: Date.now() };
      }
      players[senderId].remoteHand = {
        data: denormalizeHandForDraw(data.hand), // convert normalized → pixel coords
        ts: data.ts || Date.now()
      };
      players[senderId].lastUpdate = data.ts || Date.now();
    }
  } catch (err) {
    console.error("Invalid MQTT message:", err);
  }
}

// Send periodic heartbeat. This lets others know we're alive.
function sendHeartbeat() {
  if (!roomId || !playerId || currentState === "menu") return; // Don't ping in menu
  client.publish(`game/rooms/${roomId}/ping`, JSON.stringify({
    playerId,
    timestamp: Date.now()
  }));
}

// Remove inactive players that haven't pinged within PLAYER_TIMEOUT.
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
    // Publish clean snapshot so everyone converges on same player list
    publishPlayers();

    // If the room becomes empty, clear retained "players" at broker so the room disappears
    if (Object.keys(players).length === 0 && client && roomId) {
      client.publish(`game/rooms/${roomId}/players`, "", { retain: true });
      console.log(`Room ${roomId} cleared from MQTT due to inactivity`);
    }
  }
}

// ---------------------------- ROOM SETTINGS ------------------------------------
/**
 * Join an existing room.
 * Subscribes to room topics, validates state/snapshot, and adds self as player.
 */
async function joinRoom(id) {
  if (!id) return;

  players = {};
  roomId = id;
  gameState = "waiting";

  // Hide "Main Menu" button in-room
  buttons = buttons.filter(btn => btn.label === "Main Menu");
  buttons.forEach(btn => { if (btn.label === "Main Menu") btn.visible = false; });

  currentState = "room";
  roomInput.hide();
  usernameInput.hide();

  // Subscribe to everything under the room prefix and explicit state
  client.subscribe(`game/rooms/${roomId}/#`);
  client.subscribe(`game/rooms/${roomId}/state`);

  // Give broker a moment to deliver retained snapshot
  await new Promise(resolve => setTimeout(resolve, 500));

  // If a round is already in progress, don't join
  if (gameState !== "waiting") {
    errorMessage = "Game is in progress";
    errorTimer = millis();
    currentState = "menu";
    leaveRoom();
    return;
  }

  // If there are no players in the retained snapshot, room doesn't exist
  if (Object.keys(players).length === 0) {
    errorMessage = "Room does not exist!";
    errorTimer = millis();
    currentState = "menu";
    leaveRoom();
    return;
  }

  // Join: subscribe to hand stream and add ourselves
  client.subscribe(`game/rooms/${roomId}/hands/#`);
  playerId = addPlayer(playerName);
  publishPlayers();
}

/**
 * Create a new room.
 * We immediately subscribe and publish a retained snapshot containing just us.
 */
function createRoom() {
  roomId = "room" + getRandomLetterAndNumber(); // random room ID like "room-ABC123"
  players = {};
  gameState = "waiting";

  // Hide "Main Menu" button
  buttons = buttons.filter(btn => btn.label === "Main Menu");
  buttons.forEach(btn => { if (btn.label === "Main Menu") btn.visible = false; });

  currentState = "room";
  roomInput.hide();
  usernameInput.hide();

  // Subscribe to room topics and hands stream
  client.subscribe(`game/rooms/${roomId}/#`);
  client.subscribe(`game/rooms/${roomId}/hands/#`);

  // Add ourselves and publish the snapshot (retained)
  playerId = addPlayer(playerName);
  publishPlayers();
}

/**
 * Leave the room: unsubscribe, clear state, and (if last) clear retained snapshot.
 */
function leaveRoom() {
  console.log("Leaving room...");

  if (playerId && players[playerId]) {
    if (currentState === "gameover") {
      // Mark disconnected so scores remain in "game over" screen
      players[playerId].left = true;
      publishPlayers();
    } else {
      // Remove ourselves from players list
      delete players[playerId];
      publishPlayers();
    }
  }

  const activePlayers = Object.values(players).filter(p => !p.left);
  if (activePlayers.length === 0 && client && roomId) {
    // Clear retained snapshot at broker so room disappears
    client.publish(`game/rooms/${roomId}/players`, "", { retain: true });
    console.log(`Room ${roomId} cleared from MQTT`);
  }

  if (client && roomId) {
    client.unsubscribe(`game/rooms/${roomId}/#`);
    client.unsubscribe(`game/rooms/${roomId}/hands/#`);
  }

  // Reset local UI/state
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

  // Show "Main Menu" button again
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

// ---------------------------- PLAYER SETTINGS ----------------------------------
/**
 * Add the local player to the room and publish an "update" event.
 * (The full snapshot is published separately via publishPlayers)
 */
function addPlayer(name) {
  const id = `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`; // unique player ID
  players[id] = { name, score: 0, ready: false, lastUpdate: Date.now() };

  // Notify others about this player's arrival
  client.publish(`game/rooms/${roomId}/players/update`, JSON.stringify({
    playerId: id,
    name,
    score: 0,
    ready: false,
    timestamp: Date.now()
  }));

  return id;
}

/**
 * Publish the full players snapshot to a retained topic.
 * New subscribers receive this immediately, which is how "joining an existing room" works.
 */
function publishPlayers() {
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

// Save & validate username, propagate to room via MQTT if already joined
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

/**
 * Toggle readiness; when all active players are ready, publish "start".
 */
function setReady() {
  if (!playerId || !players[playerId]) return;

  players[playerId].ready = !players[playerId].ready;
  readyButton.label = players[playerId].ready ? "Unready" : "Ready";

  // Publish this player's readiness change
  client.publish(`game/rooms/${roomId}/players/update`, JSON.stringify({
    playerId,
    name: players[playerId].name,
    score: players[playerId].score,
    ready: players[playerId].ready,
    left: !!players[playerId].left,
    timestamp: Date.now()
  }));

  // Publish full snapshot
  publishPlayers();

  // If we're "waiting" or at "gameover" and everyone is ready, start a new round
  const activePlayers = Object.values(players).filter(p => !p.left);
  if (gameState === "waiting" || gameState === "gameover") {
    if (activePlayers.length > 0 && activePlayers.every(p => p.ready)) {
      client.publish(`game/rooms/${roomId}/start`, JSON.stringify({ timestamp: Date.now() }));
    }
  }
}

// ------------------------------ BUTTON CLASS -----------------------------------
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

// ------------------------------- CALLBACKS -------------------------------------
function gotHands(results) {
  hands = results;
}

function gotClassification(results) {
  // Normalize confidences
  let sum = results.reduce((acc, r) => acc + r.confidence, 0);
  let normalized = results.map(r => ({ label: r.label, confidence: r.confidence / sum }));
  normalized.sort((a, b) => b.confidence - a.confidence);

  // Require decent confidence to accept a letter
  if (normalized[0].confidence >= 0.6) {
    let now = millis();
    let expectedLetter = currentWord[currentIndex];

    // Prevent rapid double-counting (500ms gate)
    if (normalized[0].label === expectedLetter && now - lastMatchTime > 500) {
      currentIndex++;
      lastMatchTime = now;
      classification = ""; // stop showing accepted letter

      // Completed the word → increment score, publish, and load next
      if (currentIndex >= currentWord.length) {
        playerScore++;
        let player = Object.values(players).find(p => p.name === playerName);
        if (player) player.score = playerScore;
        publishPlayers();

        currentWord = random(words).toUpperCase().replace(/\s+/g, '');
        currentIndex = 0;
      }
    }
  }
}

/**
 * After ML model loads, show "Main Menu" button (navigation).
 */
function modelLoaded() {
  buttons.push(new Button(width / 2 - 100, height / 2 + 190, 200, 60, "Main Menu", () => {
    window.location.href = "../index.html";
  }));
}

// ------------------------------- HAND DATA -------------------------------------
/**
 * Convert hand keypoints into normalized features for the classifier:
 * - Normalized x,y per keypoint within hand bbox
 * - For each connection, normalized distance + angle
 */
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
    let angle = Math.atan2(dy, dx) / Math.PI; // normalize angle by π
    handData.push(distance);
    handData.push(angle);
  }

  return handData;
}

/**
 * Draw a single hand skeleton (local) in cyan/white.
 */
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

/**
 * Assign a persistent random color per remote player for drawing hands.
 */
function getPlayerColor(id) {
  if (!playerColors[id]) {
    playerColors[id] = color(random(60, 255), random(60, 255), random(60, 255));
  }
  return playerColors[id];
}

/**
 * Normalize a detected hand for sending over MQTT (values 0..1).
 * We convert keypoints into a dictionary keyed by their names.
 */
function normalizeHandForSend(hand) {
  if (!hand || !hand.keypoints) return null;

  const named = {};
  for (const kp of hand.keypoints) {
    const name = kp.name || kp.part || kp.index; // be robust to different ml5 versions
    if (typeof name === 'string') {
      named[name] = {
        x: +(kp.x / video.width).toFixed(3),
        y: +(kp.y / video.height).toFixed(3)
      };
    }
  }
  return named;
}

/**
 * Convert normalized hand coords back to pixels for drawing.
 */
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

/**
 * Publish our hand skeleton to the broker (throttled in maybePublishHand).
 */
function publishHand() {
  if (!client || !roomId || !playerId) return;
  if (!hands || !hands[0]) return;

  const norm = normalizeHandForSend(hands[0]);
  if (!norm) return;

  client.publish(`game/rooms/${roomId}/hands/${playerId}`, JSON.stringify({
    playerId, hand: norm, ts: Date.now()
  }));
}

/**
 * Limit hand publishing to HAND_FPS using a simple time gate.
 */
function maybePublishHand() {
  const now = millis();
  if (now - lastHandPublishAt < 1000 / HAND_FPS) return;
  lastHandPublishAt = now;
  publishHand();
}

/**
 * Draw a colored hand skeleton with optional name label (used for remote players).
 */
function drawHandSkeletonColored(hand, fingers, pointColor, lineColor, nameLabel) {
  const mapPt = (name) => {
    const pt = hand[name];
    if (!pt) return null;
    const x = map(pt.x, 0, video.width, 0, width);
    const y = map(pt.y, 0, video.height, 0, height);
    return { x, y };
  };

  // Points
  noStroke();
  fill(pointColor || 'cyan');
  for (const name in hand) {
    const p = mapPt(name);
    if (!p) continue;
    ellipse(p.x, p.y, 12, 12);
  }

  // Lines
  stroke(lineColor || 255);
  strokeWeight(2);
  for (const finger in fingers) {
    const chain = fingers[finger].map(mapPt).filter(Boolean);
    for (let i = 0; i < chain.length - 1; i++) {
      line(chain[i].x, chain[i].y, chain[i + 1].x, chain[i + 1].y);
    }
  }

  // Label (near wrist)
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

/**
 * Draw local hand (with our name) and all remote hands (with their names).
 * Remote hands older than HAND_STALE_MS are ignored to avoid lag "ghosts".
 */
function drawAllHands() {
  if (hands.length > 0 && hands[0]) {
    drawHandSkeletonColored(hands[0], fingers, 'cyan', 255, playerName);
  }

  const now = Date.now();
  for (const id in players) {
    if (id === playerId) continue; // skip ourselves
    const p = players[id];
    if (!p || !p.remoteHand || !p.remoteHand.data) continue;
    if (now - p.remoteHand.ts > HAND_STALE_MS) continue;

    const col = getPlayerColor(id);
    drawHandSkeletonColored(p.remoteHand.data, fingers, col, col, p.name);
  }
}