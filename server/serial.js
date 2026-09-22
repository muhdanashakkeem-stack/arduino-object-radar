const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const BAUD_RATE = 9600;
const WARNING_DISTANCE = 20.0;

// Central connection & radar telemetry state
let activePort = null;
let activeParser = null;
let connectedPortName = null;
let isConnecting = false;
let autoReconnectTimer = null;
let manualDisconnect = false;

let radarState = {
    connected: false,
    angle: 0.0,
    distance: 400.0,
    warning: false
};

let isCloudEnvironment = false;
let hasLoggedCloudNotice = false;

/**
 * Scan system ports and automatically find an Arduino or USB-to-Serial adapter
 */
async function findArduinoPort() {
    if (isCloudEnvironment) {
        return null;
    }

    try {
        const ports = await SerialPort.list();

        // 1. Check for explicit Arduino keywords and common USB-serial chips
        const keywords = [
            'ARDUINO',
            'ARDUINO UNO',
            'USB SERIAL',
            'USB-SERIAL',
            'CH340',
            'CH341',
            'CP210',
            'FTDI'
        ];

        for (const port of ports) {
            const searchFields = [
                port.path || '',
                port.manufacturer || '',
                port.serialNumber || '',
                port.pnpId || '',
                port.friendlyName || '',
                port.vendorId || '',
                port.productId || ''
            ].join(' ').toUpperCase();

            if (keywords.some(k => searchFields.includes(k))) {
                return port.path;
            }
        }

        // 2. Fallback: If only one USB-based COM port exists, use it
        const usbPorts = ports.filter(p => p.vendorId || p.productId || (p.pnpId && p.pnpId.includes('USB')));
        if (usbPorts.length === 1) {
            return usbPorts[0].path;
        }
    } catch (err) {
        // Handle cloud/Docker environments where udevadm does not exist (Render, Railway, Heroku, etc.)
        if (err.message && (err.message.includes('udevadm') || err.message.includes('ENOENT'))) {
            isCloudEnvironment = true;
            if (!hasLoggedCloudNotice) {
                hasLoggedCloudNotice = true;
                console.log('[SerialManager] Cloud/Container environment detected (udevadm not installed).');
                console.log('[SerialManager] Local USB scanning disabled. Cloud Telemetry & Simulation active.');
                setSimulation(true);
            }
            return null;
        }
        console.error('[SerialManager] Error listing serial ports:', err.message);
    }

    return null;
}

/**
 * Stop any pending auto-reconnect timer
 */
function clearReconnectTimer() {
    if (autoReconnectTimer) {
        clearTimeout(autoReconnectTimer);
        autoReconnectTimer = null;
    }
}

/**
 * Schedule automatic background reconnection
 */
function scheduleAutoReconnect(delayMs = 2000) {
    if (manualDisconnect || isCloudEnvironment) {
        return; // Do not poll USB in cloud containers without hardware
    }

    clearReconnectTimer();
    autoReconnectTimer = setTimeout(async () => {
        if (!radarState.connected && !isConnecting && !isCloudEnvironment) {
            const detected = await findArduinoPort();
            if (detected) {
                console.log(`[SerialManager] Arduino detected on ${detected}. Attempting auto-reconnect...`);
                connectArduino();
            } else if (!isCloudEnvironment) {
                scheduleAutoReconnect(2000);
            }
        }
    }, delayMs);
}

/**
 * Clean up active serial port instance safely
 */
function cleanupPort() {
    if (activePort) {
        try {
            activePort.removeAllListeners();
            if (activePort.isOpen) {
                activePort.close();
            }
        } catch (e) {
            // ignore close errors during cleanup
        }
        activePort = null;
    }
    activeParser = null;
    connectedPortName = null;
    radarState.connected = false;
    radarState.warning = false;
}

/**
 * Connect to Arduino (SINGLE central connection function)
 */
async function connectArduino() {
    manualDisconnect = false; // Reset manual disconnect flag

    if (isCloudEnvironment) {
        return {
            connected: radarState.connected,
            port: 'Cloud Server (Render)',
            baudRate: BAUD_RATE,
            message: 'Running in cloud environment. Telemetry stream or demo simulation active.'
        };
    }

    // Duplicate connection protection
    if (radarState.connected && activePort && activePort.isOpen) {
        return {
            connected: true,
            port: connectedPortName,
            baudRate: BAUD_RATE,
            message: `Already connected to Arduino on ${connectedPortName}`
        };
    }

    if (isConnecting) {
        return {
            connected: false,
            port: null,
            baudRate: BAUD_RATE,
            message: 'Connection attempt already in progress...'
        };
    }

    isConnecting = true;
    clearReconnectTimer();

    try {
        const portPath = await findArduinoPort();

        if (!portPath) {
            cleanupPort();
            isConnecting = false;
            console.log('[SerialManager] Arduino not found. Please connect the USB cable.');
            scheduleAutoReconnect(2000);
            return {
                connected: false,
                port: null,
                baudRate: BAUD_RATE,
                message: 'Arduino not found. Please connect the USB cable.'
            };
        }

        cleanupPort();

        console.log(`[SerialManager] Connecting to Arduino on ${portPath} at ${BAUD_RATE} baud...`);

        return await new Promise((resolve) => {
            const port = new SerialPort({
                path: portPath,
                baudRate: BAUD_RATE,
                autoOpen: false
            });

            const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

            let connectionResolved = false;

            const onConnectSuccess = () => {
                if (connectionResolved) return;
                connectionResolved = true;
                isConnecting = false;

                activePort = port;
                activeParser = parser;
                connectedPortName = portPath;
                radarState.connected = true;

                console.log(`[SerialManager] Successfully connected to Arduino on ${portPath}`);

                resolve({
                    connected: true,
                    port: portPath,
                    baudRate: BAUD_RATE,
                    message: `Connected to ${portPath}`
                });
            };

            const onConnectFailure = (errMsg) => {
                if (connectionResolved) return;
                connectionResolved = true;
                isConnecting = false;

                cleanupPort();
                console.error(`[SerialManager] Connection failed on ${portPath}: ${errMsg}`);
                scheduleAutoReconnect(2000);

                resolve({
                    connected: false,
                    port: null,
                    baudRate: BAUD_RATE,
                    message: `Failed to open ${portPath}: ${errMsg}`
                });
            };

            port.on('open', () => {
                onConnectSuccess();
            });

            port.on('error', (err) => {
                console.error(`[SerialManager] Serial error: ${err.message}`);
                if (!connectionResolved) {
                    onConnectFailure(err.message);
                } else {
                    handleDisconnect(`Serial error: ${err.message}`);
                }
            });

            port.on('close', () => {
                console.log('[SerialManager] Serial port closed.');
                handleDisconnect('Port closed');
            });

            // Parse incoming stream of "angle,distance" lines
            parser.on('data', (rawChunk) => {
                const line = rawChunk.toString().trim();
                if (!line) return;

                const parts = line.split(',');
                if (parts.length !== 2) return;

                const angleVal = parseFloat(parts[0]);
                const distVal = parseFloat(parts[1]);

                if (!isNaN(angleVal) && angleVal >= 0 && angleVal <= 180) {
                    radarState.angle = angleVal;
                }

                if (!isNaN(distVal) && distVal >= 0) {
                    radarState.distance = distVal;
                    radarState.warning = (distVal > 0 && distVal <= WARNING_DISTANCE);
                }
            });

            // Open port
            port.open((err) => {
                if (err) {
                    onConnectFailure(err.message);
                }
            });
        });

    } catch (err) {
        isConnecting = false;
        cleanupPort();
        scheduleAutoReconnect(2000);
        return {
            connected: false,
            port: null,
            baudRate: BAUD_RATE,
            message: `Unexpected error: ${err.message}`
        };
    }
}

/**
 * Handle unexpected port disconnection (unplugged cable)
 */
function handleDisconnect(reason = 'Disconnected') {
    if (!radarState.connected && !activePort) return;

    console.log(`[SerialManager] Arduino disconnected (${reason}).`);
    cleanupPort();
    scheduleAutoReconnect(2000);
}

/**
 * Explicitly disconnect Arduino
 */
async function disconnectArduino() {
    manualDisconnect = true; // Prevent automatic reconnect until user triggers connect
    clearReconnectTimer();

    const wasPort = connectedPortName;
    cleanupPort();

    console.log(`[SerialManager] Arduino disconnected manually by user.`);

    return {
        connected: false,
        port: null,
        message: wasPort ? `Disconnected from ${wasPort}` : 'Disconnected'
    };
}

/**
 * Get latest live radar telemetry
 */
function getRadarData() {
    return {
        connected: radarState.connected,
        angle: radarState.angle,
        distance: radarState.distance,
        warning: radarState.warning
    };
}

/**
 * Get current connection status and hardware parameters
 */
function getStatus() {
    return {
        connected: radarState.connected,
        port: isSimulatingActive ? 'Simulation (Demo Mode)' : connectedPortName,
        baudRate: BAUD_RATE,
        simulating: isSimulatingActive
    };
}

// -------------------------------------------------------------
// CLOUD HOSTING & DEMO SIMULATION HELPERS
// -------------------------------------------------------------
let isSimulatingActive = false;
let simulationInterval = null;
let simAngle = 0;
let simDirection = 1;

function isSimulating() {
    return isSimulatingActive;
}

function setSimulation(enable) {
    if (enable && !isSimulatingActive) {
        isSimulatingActive = true;
        radarState.connected = true;
        if (simulationInterval) clearInterval(simulationInterval);
        simulationInterval = setInterval(() => {
            simAngle += simDirection;
            if (simAngle >= 180) {
                simAngle = 180;
                simDirection = -1;
            } else if (simAngle <= 0) {
                simAngle = 0;
                simDirection = 1;
            }

            // Simulate an object around 60°–80° at ~14.5 cm
            let simDistance = 400.0;
            if (simAngle >= 60 && simAngle <= 80) {
                simDistance = 14.5 + Math.sin(simAngle) * 2;
            }

            radarState.angle = simAngle;
            radarState.distance = simDistance;
            radarState.warning = (simDistance <= WARNING_DISTANCE);
        }, 30);

        console.log('[SerialManager] Demo simulation activated.');
    } else if (!enable && isSimulatingActive) {
        isSimulatingActive = false;
        if (simulationInterval) {
            clearInterval(simulationInterval);
            simulationInterval = null;
        }
        if (!activePort) {
            radarState.connected = false;
        }
        console.log('[SerialManager] Demo simulation stopped.');
    }

    return {
        simulating: isSimulatingActive,
        connected: radarState.connected
    };
}

/**
 * Manually set telemetry (used by local hardware bridge or cloud relay)
 */
function setTelemetry(angle, distance, connected = true) {
    if (isSimulatingActive) {
        setSimulation(false); // Stop simulation if live telemetry arrives
    }

    radarState.connected = connected;
    if (angle >= 0 && angle <= 180) radarState.angle = angle;
    if (distance >= 0) {
        radarState.distance = distance;
        radarState.warning = (distance > 0 && distance <= WARNING_DISTANCE);
    }
}

// Kick off initial automatic connection scan in background
scheduleAutoReconnect(500);

module.exports = {
    connectArduino,
    disconnectArduino,
    getRadarData,
    getStatus,
    setTelemetry,
    setSimulation,
    isSimulating
};
