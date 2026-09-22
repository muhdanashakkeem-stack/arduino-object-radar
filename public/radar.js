// DOM Element References
const canvas = document.getElementById('radar-canvas');
const ctx = canvas.getContext('2d');

const elAngle = document.getElementById('val-angle');
const elDistance = document.getElementById('val-distance');
const cardDistance = document.getElementById('card-distance');
const elStatus = document.getElementById('val-status');
const elConnection = document.getElementById('connection-status');
const elWarning = document.getElementById('warning-box');
const btnConnect = document.getElementById('btn-connect');
const btnConnectText = document.getElementById('btn-connect-text');
const toastMessage = document.getElementById('toast-message');

// Radar Geometry Constants
const MAX_DISTANCE = 30; // 30 cm maximum radar display radius
const DETECT_THRESHOLD = 30; // Object detection boundary
const WARNING_THRESHOLD = 20; // Critical warning threshold (<= 20cm)
const TRAIL_FADE_SEC = 2.5; // Seconds for radar sweep trail persistence

// Live sweep trail history
const trailHistory = [];

// Live telemetry state from API
let liveData = {
    angle: 0.0,
    distance: 400.0,
    warning: false,
    connected: false
};

// Canvas dimensions and coordinate origin
let centerX = 0;
let centerY = 0;
let radius = 0;
let scale = 0; // pixels per cm
let dynamicFontSize = 13;
let toastTimeout = null;

/**
 * Responsive Canvas Sizing & DPR scaling
 */
function resizeCanvas() {
    const wrapper = canvas.parentElement;
    if (!wrapper) return;

    const dpr = window.devicePixelRatio || 1;
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const marginSide = Math.max(28, Math.min(50, Math.round(w * 0.06)));
    const marginTop = Math.max(30, Math.min(50, Math.round(h * 0.07)));

    const maxR_width = (w - marginSide * 2) / 2;
    const maxR_height = h - marginTop - 18;

    radius = Math.max(50, Math.min(maxR_width, maxR_height));
    scale = radius / MAX_DISTANCE;

    centerX = Math.round(w / 2);

    if (h > radius + 90) {
        centerY = Math.min(h - 18, Math.round((h + radius) / 2 + 5));
    } else {
        centerY = h - 16;
    }

    dynamicFontSize = Math.max(10, Math.min(14, Math.round(radius * 0.046)));
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 150));
resizeCanvas();

/**
 * Polar to Cartesian Coordinate Mapping
 * Radar coordinates: 0° = right, 90° = up, 180° = left
 */
function polarToCartesian(angleDeg, distCm) {
    const rad = angleDeg * (Math.PI / 180);
    const clampedDist = Math.min(distCm, MAX_DISTANCE);
    const r = clampedDist * scale;
    return {
        x: centerX + r * Math.cos(rad),
        y: centerY - r * Math.sin(rad)
    };
}

/**
 * Display non-intrusive notification toast
 */
function showToast(msg) {
    if (!toastMessage) return;
    toastMessage.textContent = msg;
    toastMessage.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toastMessage.classList.remove('show');
    }, 3500);
}

/**
 * Main Radar Rendering Loop
 */
function drawRadar() {
    const wrapper = canvas.parentElement;
    if (!wrapper) return;
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;

    ctx.clearRect(0, 0, w, h);

    const now = Date.now();
    const sensorAngle = liveData.angle;
    const curDist = liveData.distance;

    // IMPORTANT MIRRORING RULE:
    // Physical servo direction is mirrored on screen:
    // displayAngle = 180 - sensorAngle
    const displayAngle = Math.max(0, Math.min(180, 180 - sensorAngle));

    const isConnected = liveData.connected;
    const isObjectDetected = isConnected && (curDist > 0 && curDist <= DETECT_THRESHOLD);

    // -------------------------------------------------------------
    // 1. DRAW SUBTLE GREEN SWEEP PHOSPHOR TRAILS
    // -------------------------------------------------------------
    for (let i = trailHistory.length - 1; i >= 0; i--) {
        const item = trailHistory[i];
        const age = (now - item.time) / 1000;
        if (age >= TRAIL_FADE_SEC) {
            trailHistory.splice(i, 1);
            continue;
        }

        const fade = 1 - (age / TRAIL_FADE_SEC);
        const rad = item.angle * (Math.PI / 180);
        const edgeX = centerX + radius * Math.cos(rad);
        const edgeY = centerY - radius * Math.sin(rad);

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(edgeX, edgeY);
        ctx.strokeStyle = `rgba(0, 255, 85, ${fade * 0.16})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }

    // -------------------------------------------------------------
    // 2. DRAW 20-DEGREE DETECTION SECTOR (GREEN BASE + RED DISTANCE FAN)
    // -------------------------------------------------------------
    if (isObjectDetected) {
        // Sector boundaries: ±10° around displayAngle
        const startAngle = displayAngle - 10;
        const endAngle = displayAngle + 10;

        const startRad = - (startAngle * Math.PI / 180);
        const endRad = - (endAngle * Math.PI / 180);

        // A. Full-Range 20° Green Base Sector (measured D to MAX_DISTANCE remains GREEN)
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startRad, endRad, true);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 255, 85, 0.28)';
        ctx.fill();

        ctx.strokeStyle = '#00ff55';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // B. Measured-Distance 20° Red Fan (0 to measured distance D is RED)
        const redRadius = Math.min(curDist, MAX_DISTANCE) * scale;

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, redRadius, startRad, endRad, true);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 17, 51, 0.72)';
        ctx.fill();

        ctx.strokeStyle = '#ff1133';
        ctx.lineWidth = 2.4;
        ctx.shadowColor = '#ff1133';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // C. Warning Badge inside 20° Sector if within danger threshold (<= 20cm)
        if (curDist <= WARNING_THRESHOLD || liveData.warning) {
            const warnMidDist = Math.max(8, Math.min(curDist * 0.52, curDist - 4));
            const warnPt = polarToCartesian(displayAngle, warnMidDist);

            ctx.save();
            ctx.translate(warnPt.x, warnPt.y);

            const warnText = (curDist <= WARNING_THRESHOLD) ? "⚠ DANGER <20cm" : "⚠ WARNING";
            const badgeFont = `bold ${Math.max(9, dynamicFontSize - 2)}px Arial`;
            ctx.font = badgeFont;
            const textMetrics = ctx.measureText(warnText);
            const badgeW = textMetrics.width + 10;
            const badgeH = Math.max(16, dynamicFontSize + 4);

            ctx.fillStyle = "rgba(180, 10, 25, 0.92)";
            ctx.strokeStyle = "#ff3344";
            ctx.lineWidth = 1.4;
            ctx.shadowColor = "#ff1133";
            ctx.shadowBlur = 12;

            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 4);
            } else {
                ctx.rect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
            }
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(warnText, 0, 0);

            ctx.restore();
        }

        // D. Object Marker at exact polar coordinate (displayAngle, curDist)
        const objPt = polarToCartesian(displayAngle, curDist);

        ctx.beginPath();
        ctx.arc(objPt.x, objPt.y, Math.max(7, radius * 0.028), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 17, 51, 0.4)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(objPt.x, objPt.y, Math.max(5, radius * 0.018), 0, Math.PI * 2);
        ctx.fillStyle = '#ff1133';
        ctx.shadowColor = '#ff1133';
        ctx.shadowBlur = 18;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(objPt.x, objPt.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Distance label badge near marker
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${dynamicFontSize - 1}px Arial`;
        ctx.textAlign = (displayAngle < 90) ? 'left' : 'right';
        const offsetX = (displayAngle < 90) ? 12 : -12;
        ctx.fillText(`${curDist.toFixed(1)} cm`, objPt.x + offsetX, objPt.y - 5);
    }

    // -------------------------------------------------------------
    // 3. DRAW RADAR GRID (Concentric Distance Rings & Labels)
    // 10cm, 20cm, 30cm
    // -------------------------------------------------------------
    const distanceRings = [10, 20, 30];
    for (let i = 0; i < distanceRings.length; i++) {
        const ringDist = distanceRings[i];
        const ringRadius = ringDist * scale;

        ctx.beginPath();
        ctx.arc(centerX, centerY, ringRadius, Math.PI, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(10, 70, 25, 0.65)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Distance text along horizontal baseline
        ctx.fillStyle = '#4ade80';
        ctx.font = `bold ${Math.max(9, dynamicFontSize - 2)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${ringDist}cm`, centerX + ringRadius, centerY - 4);
    }

    // Baseline (0° to 180° horizontal line across the center origin)
    ctx.beginPath();
    ctx.moveTo(centerX - radius - 14, centerY);
    ctx.lineTo(centerX + radius + 14, centerY);
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // -------------------------------------------------------------
    // 4. DRAW ANGLE RADIAL GRID LINES & LABELS (30°, 60°, 90°, 120°, 150°)
    // -------------------------------------------------------------
    const gridAngles = [30, 60, 90, 120, 150];
    for (let i = 0; i < gridAngles.length; i++) {
        const a = gridAngles[i];
        const rad = a * (Math.PI / 180);
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);

        const edgeX = centerX + radius * cosA;
        const edgeY = centerY - radius * sinA;

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(edgeX, edgeY);
        ctx.strokeStyle = 'rgba(12, 75, 28, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        const tickX = centerX + (radius + 8) * cosA;
        const tickY = centerY - (radius + 8) * sinA;
        ctx.beginPath();
        ctx.moveTo(edgeX, edgeY);
        ctx.lineTo(tickX, tickY);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        const labelX = centerX + (radius + 18) * cosA;
        const labelY = centerY - (radius + 18) * sinA;
        ctx.fillStyle = '#86efac';
        ctx.font = `bold ${dynamicFontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${a}°`, labelX, labelY);
    }

    // Labels for 0° and 180°
    ctx.fillStyle = '#86efac';
    ctx.font = `bold ${dynamicFontSize}px Arial`;
    ctx.textAlign = 'left';
    ctx.fillText('0°', centerX + radius + 16, centerY - 2);
    ctx.textAlign = 'right';
    ctx.fillText('180°', centerX - radius - 16, centerY - 2);

    // -------------------------------------------------------------
    // 5. DRAW LIVE GREEN SWEEP LINE
    // Driven continuously by mirrored angle: displayAngle = 180 - sensorAngle
    // -------------------------------------------------------------
    const sweepRad = displayAngle * (Math.PI / 180);
    const sweepEdgeX = centerX + radius * Math.cos(sweepRad);
    const sweepEdgeY = centerY - radius * Math.sin(sweepRad);

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(sweepEdgeX, sweepEdgeY);
    ctx.strokeStyle = isConnected ? '#00ff55' : '#557755';
    ctx.lineWidth = 2.8;
    if (isConnected) {
        ctx.shadowColor = '#00ff55';
        ctx.shadowBlur = 12;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center origin pivot dot
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
    ctx.fillStyle = isObjectDetected ? '#ff1133' : (isConnected ? '#00ff55' : '#888888');
    ctx.fill();
}

/**
 * Resolve API endpoint URL (supports local server and cloud backends like Render)
 */
function getApiUrl(endpoint) {
    const base = window.API_BASE_URL || localStorage.getItem('RADAR_BACKEND_URL') || '';
    return `${base.replace(/\/+$/, '')}${endpoint}`;
}

/**
 * Fetch live radar data from GET /api/radar
 */
async function fetchRadarData() {
    try {
        const response = await fetch(getApiUrl('/api/radar'), { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        liveData = data;

        const sensorAngle = data.angle || 0;
        const displayAngle = Math.max(0, Math.min(180, 180 - sensorAngle));

        // Update trail only when connected
        if (data.connected) {
            trailHistory.push({
                angle: displayAngle,
                time: Date.now()
            });

            if (trailHistory.length > 60) {
                trailHistory.shift();
            }
        }

        // Angle Display
        elAngle.textContent = `${Math.round(displayAngle)}°`;

        const isDetected = data.connected && (data.distance > 0 && data.distance <= DETECT_THRESHOLD);

        // Distance & Warning Display
        if (isDetected) {
            elDistance.textContent = `${data.distance.toFixed(1)} cm`;
            elDistance.classList.add('detected');
            if (cardDistance) cardDistance.classList.add('detected');

            if (data.distance <= WARNING_THRESHOLD || data.warning) {
                elStatus.textContent = 'DANGER';
                elStatus.style.color = '#ff1133';

                elWarning.className = 'alert';
                elWarning.innerHTML = `⚠ DANGER &lt;20cm &nbsp;|&nbsp; Angle: ${Math.round(displayAngle)}° &nbsp;|&nbsp; Distance: ${data.distance.toFixed(1)} cm`;
            } else {
                elStatus.textContent = 'DETECTED';
                elStatus.style.color = '#ffaa00';

                elWarning.className = 'alert';
                elWarning.innerHTML = `⚠ OBJECT DETECTED IN 20° SECTOR &nbsp;|&nbsp; Angle: ${Math.round(displayAngle)}° &nbsp;|&nbsp; Distance: ${data.distance.toFixed(1)} cm`;
            }
        } else {
            if (data.connected && data.distance > 0 && data.distance < 400) {
                elDistance.textContent = `${data.distance.toFixed(1)} cm`;
            } else {
                elDistance.textContent = '-- cm';
            }
            elDistance.classList.remove('detected');
            if (cardDistance) cardDistance.classList.remove('detected');

            if (data.connected) {
                elStatus.textContent = 'CLEAR';
                elStatus.style.color = '#4ade80';
                elWarning.className = 'safe';
                elWarning.textContent = 'NO OBJECT DETECTED';
            } else {
                elStatus.textContent = 'WAITING';
                elStatus.style.color = '#888888';
                elWarning.className = 'safe';
                elWarning.textContent = 'WAITING FOR ARDUINO...';
            }
        }

        // Connection Badge & Blue Button State Updates
        updateConnectionUI(data.connected);

    } catch (err) {
        liveData.connected = false;
        updateConnectionUI(false, '● Server Disconnected');
    }
}

/**
 * Synchronize UI elements with current connection status
 */
function updateConnectionUI(connected, customStatusText = null) {
    if (connected) {
        elConnection.textContent = '● Arduino Connected';
        elConnection.className = 'connected';

        btnConnect.classList.add('connected');
        btnConnectText.textContent = '● CONNECTED';
    } else {
        elConnection.textContent = customStatusText || '● Arduino Disconnected';
        elConnection.className = '';

        btnConnect.classList.remove('connected');
        btnConnectText.textContent = 'CONNECT';
    }
}

/**
 * Central Frontend Trigger for Connecting Arduino
 * Invoked by F5, F4, and Blue Connect Button
 * Calls POST /api/connect -> Node.js connectArduino()
 */
async function requestConnect() {
    btnConnect.classList.add('busy');
    btnConnectText.textContent = '...';

    try {
        const response = await fetch(getApiUrl('/api/connect'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
        });

        const result = await response.json();

        btnConnect.classList.remove('busy');

        if (result.connected) {
            updateConnectionUI(true);
            showToast(`Connected to ${result.port || 'Arduino'}`);
        } else {
            updateConnectionUI(false);
            showToast(result.message || 'Arduino not found. Please connect the USB cable.');
        }
    } catch (err) {
        btnConnect.classList.remove('busy');
        updateConnectionUI(false);
        showToast('Server error while connecting. Is server running?');
    }
}

/**
 * KEYBOARD SHORTCUTS (F5, F4 for Connect, F3 for Hidden Admin)
 */
window.addEventListener('keydown', (event) => {
    // F3 Hidden Admin Panel Trigger
    if (event.key === 'F3' || event.code === 'F3' || event.keyCode === 114) {
        event.preventDefault();
        console.log('[Shortcut] F3 pressed: Opening Admin Panel...');
        window.location.href = '/admin';
        return false;
    }

    // F5 Connect Trigger (Intercept refresh)
    if (event.key === 'F5' || event.code === 'F5' || event.keyCode === 116) {
        event.preventDefault();
        console.log('[Shortcut] F5 pressed: Requesting connection to Arduino...');
        requestConnect();
        return false;
    }

    // F4 Connect Trigger
    if (event.key === 'F4' || event.code === 'F4' || event.keyCode === 115) {
        event.preventDefault();
        console.log('[Shortcut] F4 pressed: Requesting connection to Arduino...');
        requestConnect();
        return false;
    }
});

// BLUE BUTTON TRIGGER
btnConnect.addEventListener('click', (event) => {
    event.preventDefault();
    console.log('[Button] Blue Connect clicked: Requesting connection to Arduino...');
    requestConnect();
});

/**
 * Render animation loop using requestAnimationFrame
 */
function animationLoop() {
    drawRadar();
    requestAnimationFrame(animationLoop);
}

// Start visual loop & polling
animationLoop();
setInterval(fetchRadarData, 60);
fetchRadarData();
