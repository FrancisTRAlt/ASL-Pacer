# ASL-Pacer

A Machine Learning game that captures ASL. It uses the Hand-pose Model in ml5.js to perform Pose Estimation to determine the letter in the Alphabet.

<br>

This game includes:
- Single-player: Can use an Arduino as an extension to the game.
- Multiplayer: Built using MQTT for online connectivity.


## Training the Model

This is built using ml5.js and p5.js to perform Pose Estimation for each letter. Collected a total of 54,000 Pose Estimation data (2000 for each letter. For "X", it is 4000. For "Y" it is "6000).
The settings I used to train the model:
```
epoch = 1000;
batchSize = 128;
learningRate = 0.001;
hiddenUnits = 2048;

ml5.handPose({ runtime: "mediapipe" }, { flipped: true });
```
[Source Code used to train the model](https://gist.github.com/FrancisTRAlt/589bbb1a6720fabb5206abb932852e06).
<i>This has been trained using only right hand.</i>


## Prerequisites

* This is built using Tauri. See their official documentation to install Tauri: https://v2.tauri.app/start/prerequisites/
* p5.js: https://p5js.org/download/
* ml5.js: https://docs.ml5js.org/#/
* Supabase: https://supabase.com/docs
* Arduino: https://www.arduino.cc/


## Installation

A step by step guide that will tell you how to get the development environment up and running for this project.

#### Step 1: Fork Repository
Once you fork and have this repository in your desktop, open the project in VScode and do the following:
```
$ cd ProjectASL
$ npm install
```

#### Step 2: Database Configuations
Copy the "config.example.json" file and rename the one you copied "config.json".
Then, replace "YOUR_SUPABASE_URL" and "YOUR_SUPABASE_ANON_KEY" with your own.
<br>
See [Supabase Documentation](https://supabase.com/docs) for more information of setting your database.
```
{
  "supabase": {
    "url": "YOUR_SUPABASE_URL",
    "anonKey": "YOUR_SUPABASE_ANON_KEY"
  }
}
```

#### Step 3: Arduino code (If you want to work with the Arduino)
<i>The Arduino must be an "Arduino nano 33 ble". Please read the Arduino documentation to get started</i>

<br>

In your Arduino IDE, copy/paste the code below and click "Upload":
```
#include <Wire.h>
#include "rgb_lcd.h"

rgb_lcd lcd;

// Player data
String playerName = "";
float avgLetterSpeed = 0.0;

// Button and LED pins
#define BUTTON_PIN A4  // Correct pin based on your testing
const int ledPin = 13; // Built-in LED
int lastButtonValue = HIGH; // For edge detection

// LCD update tracking
String lastPlayerName = "";
float lastSpeed = -1;

void setup() {
  Serial.begin(9600);
  while (!Serial) {}

  // LCD setup
  lcd.begin(16, 2);
  lcd.setRGB(255, 255, 255); // White backlight

  // Button and LED setup
  pinMode(BUTTON_PIN, INPUT_PULLUP); // Use internal pull-up for stability
  pinMode(ledPin, OUTPUT);
}

void loop() {
  // --- Read Serial Data from PC ---
  if (Serial.available()) {
    String data = Serial.readStringUntil('\n'); // Expect "PlayerName,1.25"
    int commaIndex = data.indexOf(',');
    if (commaIndex > 0 && commaIndex < data.length() - 1) {
      playerName = data.substring(0, commaIndex);
      avgLetterSpeed = data.substring(commaIndex + 1).toFloat();
    }
  }

  // --- Button Press Detection with Debounce ---
  int currentValue = digitalRead(BUTTON_PIN);

  // Detect press event (HIGH → LOW)
  if (currentValue == LOW && lastButtonValue == HIGH) {
    Serial.println("BUTTON PRESSED!");
    digitalWrite(ledPin, HIGH);
    delay(200); // Blink effect
    digitalWrite(ledPin, LOW);
  }

  lastButtonValue = currentValue;
  delay(40); // Debounce

  // --- Update LCD Display only if data changed ---
  if (playerName != lastPlayerName || avgLetterSpeed != lastSpeed) {
    lcd.clear();

    // Player name on left
    lcd.setCursor(0, 0);
    lcd.print(playerName);

    // Avg speed on right
    String speedText = String(avgLetterSpeed, 2) + "s";
    int pos = 16 - speedText.length();
    lcd.setCursor(pos, 0);
    lcd.print(speedText);

    // Progress bar on second line
    int barLength = constrain(map(avgLetterSpeed * 100, 0, 500, 0, 16), 0, 16);
    lcd.setCursor(0, 1);
    for (int i = 0; i < barLength; i++) {
      lcd.write(byte(255)); // Full block character
    }

    lastPlayerName = playerName;
    lastSpeed = avgLetterSpeed;
  }
}
```

#### Step 4: Running the Tauri app
To run the Tauri app, do the following command:
```
$ npm run tauri dev
```

To build the Tauri app, do the following command:
```
$ npm run tauri build
```
This will give you an exe file in the "src-tauri" folder. (Assume the user is in Windows).


## Other information

- This project was inspired by Code Train: https://www.youtube.com/channel/UCvjgXvBlbQiydffZU7m1_aw.
- This project satisfy the course "SEIS 744: IoT with Machine Learning".
