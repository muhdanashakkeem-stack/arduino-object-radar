const express = require('express');
const path = require('path');
const serialManager = require('./serial');

const app = express();
const PORT = process.env.PORT || 5000;

// Body parsing
app.use(express.json());

// CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Paths to static directories
const publicDir = path.join(__dirname, '..', 'public');
const adminDir = path.join(__dirname, '..', 'admin');

// Serve Admin UI at /admin
app.use('/admin', express.static(adminDir));

// Serve Public UI at /
app.use(express.static(publicDir));

// Route aliases
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(adminDir, 'index.html'));
});

// ============================================================
// WEB API ROUTES
// ============================================================

/**
 * GET /api/radar
 * Returns current radar telemetry: angle, distance, warning, connected
 */
app.get('/api/radar', (req, res) => {
    const data = serialManager.getRadarData();
    res.json(data);
});

/**
 * GET /api/status
 * Returns hardware connection status: connected, port, baudRate
 */
app.get('/api/status', (req, res) => {
    const status = serialManager.getStatus();
    res.json(status);
});

/**
 * POST /api/connect
 * Main connection endpoint invoked by F5, F4, Connect button, and Admin UI.
 * Calls the single central connection manager in serial.js.
 */
app.post('/api/connect', async (req, res) => {
    try {
        const result = await serialManager.connectArduino();
        res.json(result);
    } catch (err) {
        res.status(500).json({
            connected: false,
            port: null,
            message: `Connection error: ${err.message}`
        });
    }
});

/**
 * POST /api/disconnect
 * Safely disconnects the active serial port.
 */
app.post('/api/disconnect', async (req, res) => {
    try {
        const result = await serialManager.disconnectArduino();
        res.json(result);
    } catch (err) {
        res.status(500).json({
            connected: false,
            message: `Disconnect error: ${err.message}`
        });
    }
});

/**
 * POST /api/telemetry
 * Allows a local hardware bridge to push physical Arduino readings to a cloud-hosted server (e.g. Render).
 */
app.post('/api/telemetry', (req, res) => {
    const { angle, distance, connected } = req.body;
    if (typeof angle === 'number' && typeof distance === 'number') {
        serialManager.setTelemetry(angle, distance, connected !== false);
        return res.json({ success: true });
    }
    res.status(400).json({ error: 'Invalid payload. Expects { angle: number, distance: number }' });
});

/**
 * POST /api/simulate
 * Toggles built-in demo sweep simulation (useful when testing cloud deployment on Render without physical USB).
 */
app.post('/api/simulate', (req, res) => {
    const enable = req.body && req.body.enable !== undefined ? req.body.enable : !serialManager.isSimulating();
    const status = serialManager.setSimulation(enable);
    res.json(status);
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('[Server] Unhandled error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

// Start Server (bind to 0.0.0.0 for cloud hosting compatibility on Render/Heroku/AWS)
const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
    console.log('============================================================');
    console.log('  ARDUINO UNO OBJECT RADAR SERVER (Node.js + Express)');
    console.log('============================================================');
    console.log(`  Local Host      : http://localhost:${PORT}`);
    console.log(`  Listening on    : http://${HOST}:${PORT}`);
    console.log(`  Admin Panel     : http://localhost:${PORT}/admin`);
    console.log(`  API Radar       : http://localhost:${PORT}/api/radar`);
    console.log(`  API Status      : http://localhost:${PORT}/api/status`);
    console.log('  Baud Rate       : 9600');
    console.log('  Port Detection  : Automatic');
    console.log('============================================================');
});

module.exports = { app, server };
