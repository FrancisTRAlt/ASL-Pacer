// ---------------- GLOBAL STATE ----------------
let video, handPose, hands = [];

// Loading state
let isLoading = true;
let progress = 0;
let modelLoaded = false;

// ---------------- PRELOAD ----------------
function preload() {
  console.log("Loading custom model from:", '../ml5Model/model_meta.json');
  handPose = ml5.handPose(
    { solutionPath: '../ml5Model/model_meta.json' },
    { flipped: true },
    () => {
      console.log("Custom model initialized successfully!");
      modelLoaded = true;
    }
  );
}

// ---------------- SETUP ----------------
function setup() {
  createCanvas(800, 600);
  noCursor();

  // Webcam setup
  video = createCapture(VIDEO, { flipped: true });
  video.size(640, 480);
  video.hide();

  // Hand detection
  handPose.detectStart(video, results => {
    hands = results;
    console.log("Detection results:", hands);

    if (isLoading && hands.length > 0) {
      console.log("Hands detected! Model is working.");
      isLoading = false;
    }
  });

  // Simulate loading progress
  let progressInterval = setInterval(() => {
    if (progress < 100) progress += 2;
    if (progress >= 100 || (!isLoading && modelLoaded)) {
      progress = 100;
      clearInterval(progressInterval);
      isLoading = false;
    }
  }, 50);
}

// ---------------- DRAW ----------------
function draw() {
  if (isLoading) {
    drawLoadingScreen();
    return;
  }

  drawPixelatedVideo();
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

  if (!modelLoaded) {
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