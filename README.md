<div align="center">
  <img src="https://github.com/user-attachments/assets/fa36fcac-cc4d-4041-839e-b79009e50371" alt="Logo" width="400" height="400">
  
  <h1 align="center"> Welcome to the ASL Pacer Repository</h1>
  <p align="center">
    A Machine Learning game that captures ASL. It uses the Hand-pose Model in ml5.js to perform Pose Estimation to determine the letter of the Alphabet.
</div>



### Table of Contents
- [App Demo](#app-demo)
- [Get Started](#get-started)
- [Training the Model](#training-the-model)
- [Credits / Acknowledgements](#credits--acknowledgements)
- [Contribution](#contribution)
- [License](#license)


# App Demo
This demo below shows the high level idea of the game.
<br>
<br>
This uses MQTT [mosquitto](https://mosquitto.org/) to perform online connectivity.
This allows to see real-time data from other players (Player's hand points for example) as well as other data to validate the game flow.
Additionally, it uses Machine Learning to detect the Alphabet using ASL.
<br>
<img src="https://github.com/user-attachments/assets/67270de5-ecf8-45f7-ac19-3f67fe8bc665" width="70%" />


# Get Started
Here are the requirements in order to use this project.
* [Tauri](https://v2.tauri.app/start/prerequisites) – Desktop app framework
* [p5.js](https://p5js.org/download/) – Creative coding library
* [ml5.js](https://ml5js.org/) – Machine learning for the web
* [Supabase](https://supabase.com/) – Database and authentication
* [Arduino](https://www.arduino.cc/) – Hardware integration

## Hardware Requirements
Hardware Requirements for this project if you want to use an Arduino.
| Component |
|-----------|
| Arduino Nano 33 BLE Sense lite |
| TinyML Shield |
| Grove LCD 16x2 (White on Blue) |
| LCD Button |
| USB Webcam (PC) |

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
<i>See the [Hardware Requirements](#hardware-requirements) before adding the code.</i>

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


# Training the Model

This is built using ml5.js and p5.js to perform Pose Estimation for each letter (A-Z excluding "J" and "Z"). Collected a total of 54,000 Pose Estimation data (2000 for each letter. For "X", it is 4000. For "Y" it is 6000).
The settings I used to train the model:
```
epoch = 1000;
batchSize = 128;
learningRate = 0.001;
hiddenUnits = 2048;

ml5.handPose({ runtime: "mediapipe" }, { flipped: true });
```
<br>
<img width="522" height="586" alt="image" src="https://github.com/user-attachments/assets/0db92bd6-d10c-48e1-aff6-e225a99620b3" />
<br>
<br>

[See the Source Code that was used to train the model](https://gist.github.com/FrancisTRAlt/589bbb1a6720fabb5206abb932852e06).
<br>
<i>Note: This has been trained using only right hand.</i>


# Credits / Acknowledgements

- This project was inspired by Code Train: https://www.youtube.com/channel/UCvjgXvBlbQiydffZU7m1_aw.
- This project is only used as a tool and not meant to replace ASL Interpreters. This only detects letters and not gestures.
- This project satisfy the course "SEIS 744: IoT with Machine Learning".


# Contribution

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request


# License
This is under the [MIT License](https://github.com/FrancisTRAlt/ASL-Pacer/blob/main/LICENSE).
