// ---------------- GLOBAL STATE ----------------
let video, handPose, hands = [];
let classifier;
let classification = "???";
let confidence = 0;

let connections;

// Loading state
let isLoading = true;
let progress = 0;
let isModelLoaded = false;

// Timer
let startTime = null;

// Word game state
let words = [];
let currentWord = "";
let currentIndex = 0;

function preload() {
  // Initialize HandPose
  handPose = ml5.handPose({ flipped: true });

  // Load words from text file (each line is a word)
  words = loadStrings("../lib/words_alpha.txt");
}

// ---------------- SETUP ----------------
function setup() {
  createCanvas(800, 600);

  // Simulate loading progress
  let progressInterval = setInterval(() => {
    if (progress < 100) progress += 2;
    if (progress >= 100 || isModelLoaded) {
      progress = 100;
      clearInterval(progressInterval);
      isLoading = false;
    }
  }, 50);

  // Webcam setup
  video = createCapture(VIDEO, { flipped: true });
  video.size(800, 600);
  video.hide();

  ml5.setBackend("webgl");

  // Set up the neural network
  let classifierOptions = {
    task: "classification",
  };
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
  if (isLoading) {
    drawLoadingScreen();
    return;
  }

  drawPixelatedVideo();

  // Perform classification if hands detected and model loaded
  if (isModelLoaded && hands[0]) {
    let inputData = flattenHandData();
    classifier.classify(inputData, gotClassification);
  }

  // Timer display (only after model is loaded)
  if (startTime !== null) {
    let elapsed = millis() - startTime;
    let seconds = floor(elapsed / 1000);
    let minutes = floor(seconds / 60);
    seconds = seconds % 60;

    let timerText = nf(minutes, 2) + ":" + nf(seconds, 2);

    textAlign(LEFT, TOP);
    textSize(32);
    fill(255);
    text(timerText, 20, 20);
  }

  // Black background for classification box
  fill("black");
  rect(width / 2 - 350, height / 2 - 170, 700, 350, 20);

  // Calculate box center
  let boxCenterX = width / 2;
  let boxCenterY = height / 2;

  // Show current word with glowing effect for correct letters
  textAlign(CENTER, CENTER);
  textSize(48);

  let spacing = 70; // space between letters
  let totalWidth = (currentWord.length - 1) * spacing;
  let startX = boxCenterX - totalWidth / 2;
  let wordY = boxCenterY;

  for (let i = 0; i < currentWord.length; i++) {
    let letter = currentWord[i];
    let xPos = startX + i * spacing;

    if (i < currentIndex) {
      // Correct letters glow green
      let glowStrength = abs(sin(frameCount * 0.1)) * 100;
      let glowColor = color(0, 255, 0, glowStrength);
      stroke(glowColor);
      strokeWeight(8);
      fill(0, 255, 0);
    } else {
      noStroke();
      fill(255);
    }

    text(letter, xPos, wordY);
  }
  strokeWeight(0);

  // Classification display above the word
  textSize(64);
  fill(0, 255, 0);
  text(classification, boxCenterX, boxCenterY - 100);
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

  // Normalized coordinates
  for (let i = 0; i < hand.keypoints.length; i++) {
    let keypoint = hand.keypoints[i];
    let normX = (keypoint.x - minX) / (maxX - minX);
    let normY = (keypoint.y - minY) / (maxY - minY);
    handData.push(normX, normY);
  }

  // Distances and angles
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

    // Check if classification matches current letter
    let expectedLetter = currentWord[currentIndex];
    if (classification === expectedLetter) {
      currentIndex++;
      if (currentIndex >= currentWord.length) {
        currentWord = random(words).toUpperCase();
        currentIndex = 0;
      }
    }
  } else {
    classification = "???";
  }
}

function modelLoaded() {
  isModelLoaded = true;
  startTime = millis(); // Start timer when model is loaded
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

  if (!isModelLoaded) {
    textSize(16);
    fill(255, 100, 100);
    text("Waiting for model to load...", width / 2, barY + barHeight + 55);
  }
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