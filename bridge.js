/**
 * ARDUINO TO CLOUD RADAR BRIDGE (bridge.js)
 *
 * Use this script on your local computer when hosting your Node.js server
 * on cloud platforms like Render, Railway, or Heroku.
 *
 * Usage:
 *   node bridge.js https://your-render-app.onrender.com
 *   (or default: http://localhost:5000)
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const TARGET_URL = process.argv[2] || process.env.CLOUD_URL || 'http://localhost:5000';
const TELEMETRY_ENDPOINT = `${TARGET_URL.replace(/\/+$/, '')}/api/telemetry`;
const BAUD_RATE = 9600;

console.log('============================================================');
console.log('  ARDUINO TO CLOUD TELEMETRY BRIDGE');
console.log('============================================================');
console.log(`  Forwarding to : ${TELEMETRY_ENDPOINT}`);
console.log(`  Baud Rate     : ${BAUD_RATE}`);
console.log('============================================================');

async function findArduinoPort() {
    try {
        const ports = await SerialPort.list();
        const keywords = ['ARDUINO', 'CH340', 'CH341', 'USB-SERIAL', 'CP210', 'FTDI'];

        for (const port of ports) {
            const combined = [
                port.path || '',
                port.manufacturer || '',
                port.serialNumber || '',
                port.pnpId || '',
                port.friendlyName || ''
            ].join(' ').toUpperCase();

            if (keywords.some(k => combined.includes(k))) {
                return port.path;
            }
        }

        const usbPorts = ports.filter(p => p.vendorId || p.productId || (p.pnpId && p.pnpId.includes('USB')));
        if (usbPorts.length === 1) return usbPorts[0].path;
    } catch (err) {
        console.error('[Bridge] Error scanning serial ports:', err.message);
    }
    return null;
}

let activePort = null;
let isConnected = false;

async function connect() {
    const portPath = await findArduinoPort();
    if (!portPath) {
        console.log('[Bridge] Arduino not found. Retrying in 2 seconds...');
        setTimeout(connect, 2000);
        return;
    }

    console.log(`[Bridge] Connecting to Arduino on ${portPath}...`);

    try {
        activePort = new SerialPort({ path: portPath, baudRate: BAUD_RATE });
        const parser = activePort.pipe(new ReadlineParser({ delimiter: '\n' }));

        activePort.on('open', () => {
            isConnected = true;
            console.log(`[Bridge] Arduino connected on ${portPath}. Streaming telemetry to cloud...`);
        });

        parser.on('data', async (raw) => {
            const line = raw.toString().trim();
            if (!line) return;
            const parts = line.split(',');
            if (parts.length !== 2) return;

            const angle = parseFloat(parts[0]);
            const distance = parseFloat(parts[1]);

            if (!isNaN(angle) && !isNaN(distance)) {
                try {
                    await fetch(TELEMETRY_ENDPOINT, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ angle, distance, connected: true })
                    });
                } catch (postErr) {
                    // silently handle intermittent network lag
                }
            }
        });

        activePort.on('close', () => {
            console.log('[Bridge] Port closed. Reconnecting in 2 seconds...');
            isConnected = false;
            setTimeout(connect, 2000);
        });

        activePort.on('error', (err) => {
            console.error('[Bridge] Serial error:', err.message);
            isConnected = false;
            try { activePort.close(); } catch (e) {}
            setTimeout(connect, 2000);
        });

    } catch (err) {
        console.error(`[Bridge] Failed to open ${portPath}:`, err.message);
        setTimeout(connect, 2000);
    }
}

connect();
