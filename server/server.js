require("dotenv").config({ path: '../.env' });
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const FRONTEND_ORIGIN = "https://arduino-object-radar.vercel.app";

app.use(cors({
  origin: FRONTEND_ORIGIN,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

const io = new Server(server, { 
  cors: { origin: FRONTEND_ORIGIN, methods: ["GET", "POST"] }
});

let activeUsers = 0;
let lastTelemetry = { angle: 0, distance: 0, connected: false, warning: false, time: null };

io.on("connection", socket => {
  activeUsers++;
  console.log("Client connected:", socket.id, "- Total active:", activeUsers);
  
  socket.on("radar-data", data => {
    lastTelemetry = { ...data, time: new Date().toISOString() };
    socket.broadcast.emit("update-radar", data);
  });
  
  socket.on("disconnect", () => {
    activeUsers--;
  });
});

app.use(express.json());

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

function requireAdmin(req, res, next) {
    const auth = req.headers.authorization || "";
    if (auth.replace("Bearer ", "") === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized access to Admin API" });
    }
}

app.get("/api/admin/status", requireAdmin, (req, res) => {
    res.json({
        ok: true,
        activeUsers,
        lastTelemetry,
        service: "Online"
    });
});

app.post("/api/telemetry", (req, res) => {
  const { angle, distance, connected } = req.body;
  
  if (!Number.isFinite(angle) || !Number.isFinite(distance)) {
    return res.status(400).json({ error: "Invalid telemetry" });
  }
  
  io.emit("update-radar", {
    angle,
    distance,
    connected: Boolean(connected),
    warning: distance >= 70 && distance <= 80
  });
  
  res.json({ ok: true });
});

app.get("/", (req, res) => res.json({ok: true, service: "Arduino Radar Backend (Socket.io Relay)"}));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("Radar backend listening on", PORT));
