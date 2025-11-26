# ASL-Pacer

A Machine Learning game that captures ASL.


## Prerequisites

* This is built using Tauri. See their official documentation to install Tauri: https://v2.tauri.app/start/prerequisites/
* p5.js: https://p5js.org/download/
* ml5.js: https://docs.ml5js.org/#/
* Supabase: https://supabase.com/docs
* Arduino: https://www.arduino.cc/


## Installation

A step by step guide that will tell you how to get the development environment up and running for this project.
Open the project in VScode and do the following:
```
$ cd ProjectASL
$ npm install
$ npm run tauri dev
```

### Configuations

Copy the "config.example.json" file and rename the one you copied "config.json".
Then, replace "YOUR_SUPABASE_URL" and "YOUR_SUPABASE_ANON_KEY" with your own.
<br>
See [Supabase Documentation](https://supabase.com/docs) for more information.
```
{
  "supabase": {
    "url": "YOUR_SUPABASE_URL",
    "anonKey": "YOUR_SUPABASE_ANON_KEY"
  }
}
```
