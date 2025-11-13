let video;
let handPose;
let hands = [];
let img;

let buttonX, buttonY, buttonW, buttonH;

function preload() {
  handPose = ml5.handPose({ flipped: true });
  img = loadImage('./assets/Background.avif');
}

function gotHands(results) {
  hands = results;
}

function setup() {
  createCanvas(640, 480);
  video = createCapture(VIDEO, { flipped: true });
  video.hide();

  handPose.detectStart(video, gotHands);

  // Button setup
  buttonW = 200;
  buttonH = 80;
  buttonX = width / 2 - buttonW / 2;
  buttonY = height - 150;
}

function draw() {
  background(img);
  image(video, 0, 0);

  // Draw button
  fill(0, 150, 255);
  rect(buttonX, buttonY, buttonW, buttonH);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(24);
  text("Start Game", buttonX + buttonW / 2, buttonY + buttonH / 2);

  if (hands.length > 0) {
    let hand = hands[0];
    let index = hand.index_finger_tip;
    let thumb = hand.thumb_tip;

    // Draw purple dot
    noStroke();
    fill(255, 0, 255);

    // Distance between fingers
    let d = dist(index.x, index.y, thumb.x, thumb.y);
    let x = ((index.x + thumb.x) * 0.5);
    let y = ((index.y + thumb.y) * 0.5);
    // Hover + Pinch condition
    if (x > buttonX && x < buttonX + buttonW && y > buttonY && y < buttonY + buttonH && d < 35) {
      fill(255, 255, 0);
      rect(buttonX, buttonY, buttonW, buttonH);
      text("Start Game", buttonX + buttonW / 2, buttonY + buttonH / 2);

      startGame();
    }
    
    circle(x, y, 16);
  }
}

function startGame() {
  console.log("Game Started!");
}