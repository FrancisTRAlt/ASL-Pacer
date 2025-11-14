let classifier;
let handPose;
let video;
let hands = [];
let classification = "";
let isModelLoaded = false;

function preload() {
  handPose = ml5.handPose();
}

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Create webcam video and hide it
  video = createCapture(VIDEO);
  video.size(windowWidth, windowHeight);
  video.hide();

  ml5.setBackend("webgl");

  let classifierOptions = { task: "classification" };
  classifier = ml5.neuralNetwork(classifierOptions);

  // Uncomment if loading a pre-trained model
  // classifier.load(modelDetails, modelLoaded);

  handPose.detectStart(video, gotHands);
}

function draw() {
  image(video, 0, 0, width, height);

  if (hands[0]) {
    let hand = hands[0];
    for (let i = 0; i < hand.keypoints.length; i++) {
      let keypoint = hand.keypoints[i];
      fill(0, 255, 0);
      noStroke();
      circle(keypoint.x, keypoint.y, 10);
    }
  }

  if (isModelLoaded && hands[0]) {
    let inputData = flattenHandData();
    classifier.classify(inputData, gotClassification);
    textSize(64);
    fill(0, 255, 0);
    text(classification, 20, 60);
  }
}

function flattenHandData() {
  let hand = hands[0];
  let handData = [];
  for (let i = 0; i < hand.keypoints.length; i++) {
    let keypoint = hand.keypoints[i];
    handData.push(keypoint.x);
    handData.push(keypoint.y);
  }
  return handData;
}

function gotHands(results) {
  hands = results;
}

function gotClassification(results) {
  classification = results[0].label;
}

function modelLoaded() {
  isModelLoaded = true;
}

// Handle window resize
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  video.size(windowWidth, windowHeight);
}