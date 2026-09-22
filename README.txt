======================================================================
           ARDUINO UNO OBJECT RADAR (NODE.JS + WEB API)
======================================================================

A real-time ultrasonic object radar application built with:
- Arduino UNO (HC-SR04 ultrasonic distance sensor + SG90 servo motor)
- Node.js (Express web server + SerialPort hardware manager)
- Interactive HTML5 Canvas radar frontend

----------------------------------------------------------------------
1. HARDWARE WIRING
----------------------------------------------------------------------

HC-SR04 Ultrasonic Sensor:
- VCC   -> Arduino 5V
- GND   -> Arduino GND
- TRIG  -> Arduino D9
- ECHO  -> Arduino D10

SG90 Micro Servo:
- Red          -> Arduino 5V (or external 5V supply)
- Brown/Black  -> Arduino GND
- Orange/Yellow-> Arduino D6

* Note: If the servo causes Arduino resets when sweeping, power the servo
  from an external 5V power supply and tie external GND to Arduino GND.

----------------------------------------------------------------------
2. UPLOAD ARDUINO CODE
----------------------------------------------------------------------

1. Open the Arduino IDE.
2. Open the sketch located at:
   arduino/radar.ino  (or arduino/radar/radar.ino)
3. Select Board: "Arduino Uno" and select your Arduino serial port.
4. Click Upload.
5. IMPORTANT: Close the Arduino IDE Serial Monitor before running the
   Node.js server so the serial port is free for Node.js.

----------------------------------------------------------------------
3. INSTALLATION & RUNNING
----------------------------------------------------------------------

Step 1: Install Node.js
  Ensure Node.js (v18 or higher) is installed on your computer.
  Verify in your terminal:
    node -v
    npm -v

Step 2: Install Project Dependencies
  Open PowerShell / Command Prompt inside this folder and run:
    npm install

Step 3: Start the Radar Server
  Run:
    npm start
  (or: node server/server.js)

Step 4: Open the Radar Interface
  Open your web browser and go to:
    http://localhost:5000

  To open the Admin Panel:
    http://localhost:5000/admin

----------------------------------------------------------------------
4. CONNECTING THE ARDUINO (F5 / F4 / BLUE BUTTON)
----------------------------------------------------------------------

Plug the Arduino UNO USB cable into your computer.
To initiate or refresh connection, you have three options:
  1. Click the blue [ CONNECT ARDUINO ] button in the top bar.
  2. Press the F5 key on your keyboard.
  3. Press the F4 key on your keyboard.

* Important: Pressing F5 will NOT reload the webpage. It calls the
  backend API directly and keeps the radar canvas running smoothly.
* All three triggers use the exact same central connection manager in
  server/serial.js via POST /api/connect.

----------------------------------------------------------------------
5. HOW AUTOMATIC DETECTION & RECONNECT WORK
----------------------------------------------------------------------

- No Manual COM Port Entry:
  You never need to find or type COM3, COM4, COM7, etc. The server
  uses SerialPort.list() to automatically inspect USB vendor, product,
  and manufacturer identifiers (matching Arduino, CH340, FTDI, CP210).

- Automatic Background Reconnect:
  If the USB cable is unplugged, the server detects the disconnection,
  gracefully sets the status to Disconnected, and keeps the webpage
  running. When you plug the Arduino back in, it reconnects automatically.

- Duplicate Connection Protection:
  Multiple clicks on Connect or F5/F4 will never create duplicate
  serial connections or crash the server.

----------------------------------------------------------------------
6. WEB API ENDPOINTS
----------------------------------------------------------------------

GET  /api/radar
  Returns live telemetry for the radar display:
  {
    "connected": true,
    "angle": 90,
    "distance": 18.5,
    "warning": true
  }

GET  /api/status
  Returns hardware port status:
  {
    "connected": true,
    "port": "COM7",
    "baudRate": 9600
  }

POST /api/connect
  Scans ports, connects to Arduino at 9600 baud, and starts streaming:
  {
    "connected": true,
    "port": "COM7",
    "message": "Connected to COM7"
  }

POST /api/disconnect
  Safely closes the active serial connection:
  {
    "connected": false,
    "message": "Disconnected"
  }

----------------------------------------------------------------------
7. RADAR DISPLAY & GEOMETRY
----------------------------------------------------------------------

- Angle Mirroring:
  Physical servo angle is mirrored for accurate left/right screen display:
  displayAngle = 180 - sensorAngle

- 20-Degree Detection Sector:
  When an object is detected at distance D within range (30 cm):
  * Sector from (displayAngle - 10°) to (displayAngle + 10°) is drawn.
  * Distance from 0 to D is illuminated as a RED glowing fan.
  * Distance from D to 30 cm remains a GREEN sector.

- Warning Distance:
  When an object is 20 cm or closer, the browser triggers a DANGER
  alert badge and sounds/highlights the readout in bright red.

----------------------------------------------------------------------
8. PROJECT STRUCTURE
----------------------------------------------------------------------

Object-Radar/
├── server/
│   ├── server.js          # Express Web API and static file server
│   ├── serial.js          # Central Arduino connection manager
│   └── package.json       # Server package configuration
│
├── public/
│   ├── index.html         # Main radar user interface
│   ├── style.css          # Responsive radar styles & dark theme
│   └── radar.js           # Canvas rendering, F5/F4 handler, polling
│
├── admin/
│   ├── index.html         # Diagnostic dashboard
│   ├── admin.css          # Admin panel styling
│   └── admin.js           # Port status & manual API controls
│
├── arduino/
│   ├── radar.ino          # Arduino UNO sketch
│   └── radar/
│       └── radar.ino      # IDE-compatible subfolder sketch
│
├── package.json           # Root package script runner
├── README.txt             # Documentation and usage guide
└── .gitignore             # Git ignore patterns

----------------------------------------------------------------------
9. TROUBLESHOOTING
----------------------------------------------------------------------

1. "Arduino not found. Please connect the USB cable."
   - Check if the USB cable is firmly connected.
   - For clone Arduino boards with CH340 chips, ensure the CH340
     Windows driver is installed.
   - Close the Arduino IDE Serial Monitor if it is open (only one
     program can access a serial port at a time).

2. "Port already in use"
   - Make sure no other serial monitor or Python script is running.
   - Restart the server with: npm start

3. Distance shows 400 or no objects detected:
   - Verify HC-SR04 wiring (TRIG -> D9, ECHO -> D10, VCC -> 5V, GND -> GND).
   - Ensure target object is within 2 cm to 30 cm of the sensor.
