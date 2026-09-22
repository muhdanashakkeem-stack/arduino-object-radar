// DOM Elements
const elStatusConn = document.getElementById('status-conn');
const elStatusPort = document.getElementById('status-port');
const elStatusBaud = document.getElementById('status-baud');
const elStatusApi = document.getElementById('status-api');

const elTeleAngle = document.getElementById('tele-angle');
const elTeleDisplayAngle = document.getElementById('tele-display-angle');
const elTeleDist = document.getElementById('tele-dist');
const elTeleWarn = document.getElementById('tele-warn');

const btnConnect = document.getElementById('btn-admin-connect');
const btnDisconnect = document.getElementById('btn-admin-disconnect');
const btnSimulate = document.getElementById('btn-admin-simulate');
const elLog = document.getElementById('admin-log');

function log(msg) {
    const timestamp = new Date().toLocaleTimeString();
    elLog.textContent = `[${timestamp}] ${msg}\n` + elLog.textContent;
}

function getApiUrl(endpoint) {
    const base = window.API_BASE_URL || localStorage.getItem('RADAR_BACKEND_URL') || '';
    return `${base.replace(/\/+$/, '')}${endpoint}`;
}

/**
 * Fetch Hardware & Port Status
 */
async function fetchStatus() {
    try {
        const res = await fetch(getApiUrl('/api/status'), { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        elStatusApi.textContent = 'Online';
        elStatusApi.style.color = '#3fb950';

        if (data.connected) {
            elStatusConn.textContent = 'CONNECTED';
            elStatusConn.className = 'stat-value connected';
            elStatusPort.textContent = data.port || 'Auto-detected';
            elStatusBaud.textContent = data.baudRate || 9600;
        } else {
            elStatusConn.textContent = 'DISCONNECTED';
            elStatusConn.className = 'stat-value disconnected';
            elStatusPort.textContent = 'None';
            elStatusBaud.textContent = data.baudRate || 9600;
        }
    } catch (err) {
        elStatusApi.textContent = 'Offline';
        elStatusApi.style.color = '#f85149';
        elStatusConn.textContent = 'NO SERVER';
        elStatusConn.className = 'stat-value disconnected';
    }
}

/**
 * Fetch Live Radar Telemetry
 */
async function fetchTelemetry() {
    try {
        const res = await fetch(getApiUrl('/api/radar'), { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();

        if (data.connected) {
            const rawAngle = data.angle || 0;
            const displayAngle = Math.max(0, Math.min(180, 180 - rawAngle));

            elTeleAngle.textContent = `${rawAngle.toFixed(0)}°`;
            elTeleDisplayAngle.textContent = `${displayAngle.toFixed(0)}°`;

            if (data.distance > 0 && data.distance < 400) {
                elTeleDist.textContent = `${data.distance.toFixed(1)} cm`;
            } else {
                elTeleDist.textContent = '> 400 cm';
            }

            elTeleWarn.textContent = data.warning ? 'YES (ALERT)' : 'NO';
            elTeleWarn.style.color = data.warning ? '#f85149' : '#3fb950';
        } else {
            elTeleAngle.textContent = '--°';
            elTeleDisplayAngle.textContent = '--°';
            elTeleDist.textContent = '--';
            elTeleWarn.textContent = '--';
            elTeleWarn.style.color = '#8b949e';
        }
    } catch (err) {
        // server offline
    }
}

/**
 * Trigger Connect (calls POST /api/connect)
 */
async function connectArduino() {
    log('Requesting POST /api/connect...');
    btnConnect.disabled = true;
    try {
        const res = await fetch(getApiUrl('/api/connect'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
        });
        const data = await res.json();
        log(`Connect Response: ${JSON.stringify(data)}`);
        fetchStatus();
    } catch (err) {
        log(`Connect error: ${err.message}`);
    } finally {
        btnConnect.disabled = false;
    }
}

/**
 * Trigger Disconnect (calls POST /api/disconnect)
 */
async function disconnectArduino() {
    log('Requesting POST /api/disconnect...');
    btnDisconnect.disabled = true;
    try {
        const res = await fetch(getApiUrl('/api/disconnect'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
        });
        const data = await res.json();
        log(`Disconnect Response: ${JSON.stringify(data)}`);
        fetchStatus();
    } catch (err) {
        log(`Disconnect error: ${err.message}`);
    } finally {
        btnDisconnect.disabled = false;
    }
}

btnConnect.addEventListener('click', connectArduino);
btnDisconnect.addEventListener('click', disconnectArduino);

if (btnSimulate) {
    btnSimulate.addEventListener('click', async () => {
        log('Toggling Demo Simulation (POST /api/simulate)...');
        try {
            const res = await fetch(getApiUrl('/api/simulate'), { method: 'POST' });
            const data = await res.json();
            log(`Simulation status: ${data.simulating ? 'ACTIVE' : 'STOPPED'}`);
            fetchStatus();
        } catch (err) {
            log(`Simulation error: ${err.message}`);
        }
    });
}

// Press F3 or Esc to return to main radar display
window.addEventListener('keydown', (event) => {
    if (event.key === 'F3' || event.code === 'F3' || event.key === 'Escape') {
        event.preventDefault();
        window.location.href = '/';
    }
});

// Initial Load & Intervals
fetchStatus();
fetchTelemetry();
setInterval(fetchStatus, 1500);
setInterval(fetchTelemetry, 100);
