// DOM Elements
const elStatusConn = document.getElementById('status-conn');
const elStatusPort = document.getElementById('status-port');
const elStatusBaud = document.getElementById('status-baud');
const elStatusApi = document.getElementById('status-api');

const elTeleAngle = document.getElementById('tele-angle');
const elTeleDisplayAngle = document.getElementById('tele-display-angle');
const elTeleDist = document.getElementById('tele-dist');
const elTeleWarn = document.getElementById('tele-warn');
const elLog = document.getElementById('admin-log');

function log(msg) {
    const timestamp = new Date().toLocaleTimeString();
    elLog.textContent = `[${timestamp}] ${msg}\n` + elLog.textContent;
}

const BACKEND_URL = "https://arduino-object-radar.onrender.com";

// Retrieve or prompt for Admin Token
let adminToken = sessionStorage.getItem('adminToken');
if (!adminToken) {
    adminToken = prompt("Enter Admin Password:");
    if (adminToken) {
        sessionStorage.setItem('adminToken', adminToken);
    } else {
        alert("Admin access requires a password.");
        window.location.href = '/';
    }
}

/**
 * Fetch Admin Data (Status & Telemetry combined)
 */
async function fetchAdminData() {
    if (!adminToken) return;
    
    try {
        const res = await fetch(`${BACKEND_URL}/api/admin/status`, {
            headers: { 'Authorization': `Bearer ${adminToken}` },
            cache: 'no-store'
        });
        
        if (res.status === 401) {
            alert("Unauthorized: Invalid Admin Password");
            sessionStorage.removeItem('adminToken');
            window.location.href = '/';
            return;
        }
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data = await res.json();

        // 1. API Status Update
        elStatusApi.textContent = 'Online';
        elStatusApi.style.color = '#3fb950';

        // 2. Hardware/Cloud Status Update
        const activeArduino = data.lastTelemetry.connected;
        if (activeArduino) {
            elStatusConn.textContent = 'DATA RECEIVING';
            elStatusConn.className = 'stat-value connected';
            elStatusPort.textContent = `Cloud Relay (Active Users: ${data.activeUsers})`;
            elStatusBaud.textContent = `Last update: ${new Date(data.lastTelemetry.time).toLocaleTimeString()}`;
        } else {
            elStatusConn.textContent = 'WAITING FOR DATA';
            elStatusConn.className = 'stat-value disconnected';
            elStatusPort.textContent = `Cloud Relay (Active Users: ${data.activeUsers})`;
            elStatusBaud.textContent = 'No recent data';
        }

        // 3. Telemetry Update
        if (activeArduino) {
            const rawAngle = data.lastTelemetry.angle || 0;
            const displayAngle = Math.max(0, Math.min(180, 180 - rawAngle));

            elTeleAngle.textContent = `${rawAngle.toFixed(0)}°`;
            elTeleDisplayAngle.textContent = `${displayAngle.toFixed(0)}°`;

            if (data.lastTelemetry.distance > 0 && data.lastTelemetry.distance <= 150) {
                elTeleDist.textContent = `${data.lastTelemetry.distance.toFixed(1)} cm`;
            } else {
                elTeleDist.textContent = '> 150 cm';
            }

            elTeleWarn.textContent = data.lastTelemetry.warning ? 'YES (DANGER)' : 'NO';
            elTeleWarn.style.color = data.lastTelemetry.warning ? '#f85149' : '#3fb950';
        } else {
            elTeleAngle.textContent = '--°';
            elTeleDisplayAngle.textContent = '--°';
            elTeleDist.textContent = '--';
            elTeleWarn.textContent = '--';
            elTeleWarn.style.color = '#8b949e';
        }
    } catch (err) {
        elStatusApi.textContent = 'Offline';
        elStatusApi.style.color = '#f85149';
        elStatusConn.textContent = 'NO SERVER';
        elStatusConn.className = 'stat-value disconnected';
    }
}

// Press F3 or Esc to return to main radar display
window.addEventListener('keydown', (event) => {
    if (event.key === 'F3' || event.code === 'F3' || event.key === 'Escape') {
        event.preventDefault();
        window.location.href = '/';
    }
});

// Initial Load & Interval
if (adminToken) {
    fetchAdminData();
    setInterval(fetchAdminData, 1500);
}
