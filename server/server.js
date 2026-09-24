const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const FRONTEND_ORIGIN = "https://arduino-object-radar.vercel.app";

app.use(cors({
  origin: FRONTEND_ORIGIN,
  methods: ["GET", "POST"]
}));

const io = new Server(server, { 
  cors: { origin: FRONTEND_ORIGIN, methods: ["GET", "POST"] }
});

io.on("connection", socket => {
  console.log("Client connected:", socket.id);
  socket.on("radar-data", data => socket.broadcast.emit("update-radar", data));
});

app.use(express.json());

app.post("/api/telemetry", (req, res) => {
  const { angle, distance, connected } = req.body;
  
  if (!Number.isFinite(angle) || !Number.isFinite(distance)) {
    return res.status(400).json({ error: "Invalid telemetry" });
  }
  
  io.emit("update-radar", {
    angle,
    distance,
    connected: Boolean(connected),
    warning: distance <= 20
  });
  
  res.json({ ok: true });
});

app.get("/", (req, res) => res.json({ok: true, service: "Arduino Radar Backend (Socket.io Relay)"}));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("Radar backend listening on", PORT));
