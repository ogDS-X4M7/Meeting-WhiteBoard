const http = require('http');
const express = require('express');
const multer = require('multer');
const WebSocket = require('ws');
const SpeechService = require('./speechService');
const ShapeRecognitionService = require('./shapeRecognitionService');
const SummaryService = require('./summaryService');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// 会议室管理
class MeetingRoomManager {
  constructor() {
    this.rooms = new Map();
  }
  generateRoomCode() {
    let code;
    do {
      const length = Math.floor(Math.random() * 3) + 4;
      code = '';
      for (let i = 0; i < length; i++) {
        code += Math.floor(Math.random() * 10);
      }
    } while (this.rooms.has(code));
    return code;
  }
  createRoom() {
    const code = this.generateRoomCode();
    const room = {
      code,
      createdAt: new Date(),
      lastActivityTime: new Date(),
      members: [],
      canvasState: [],
      beautifyState: null
    };
    this.rooms.set(code, room);
    return room;
  }
  getRoom(code) {
    return this.rooms.get(code);
  }
  joinRoom(code, socketId) {
    let room = this.rooms.get(code);
    if (!room || room.members.length === 0) {
      room = {
        code,
        createdAt: new Date(),
        lastActivityTime: new Date(),
        members: [],
        canvasState: [],
        beautifyState: null
      };
      this.rooms.set(code, room);
    }
    const exist = room.members.find(m => m.socketId === socketId);
    if (exist) return room;
    room.members.push({
      id: `user_${Date.now()}`,
      socketId,
      joinedAt: new Date(),
      nickname: `用户${Math.floor(Math.random() * 1000)}`
    });
    return room;
  }
  leaveRoom(code, socketId) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.members = room.members.filter((m) => {
      return m.socketId !== socketId;
    });
    if (room.members.length === 0) {
      this.rooms.delete(code);
    }
  }
  cleanupEmptyRooms() {
    const now = new Date();
    for (const [code, r] of this.rooms.entries()) {
      if (r.members.length === 0 || now - r.lastActivityTime > 10 * 60 * 1000) {
        this.rooms.delete(code);
      }
    }
  }
  updateCanvasState(code, state) {
    const room = this.rooms.get(code);
    if (room) {
      room.canvasState = state;
      room.lastActivityTime = new Date();
    }
  }
  getCanvasState(code) {
    return this.rooms.get(code)?.canvasState || [];
  }
  broadcastToRoom(code, msg, excludeId) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.members.forEach(m => {
      if (m.socketId !== excludeId) {
        const ws = clients.find(c => c.id === m.socketId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(msg);
        }
      }
    });
  }
}

const meetingRoomManager = new MeetingRoomManager();
let clients = [];

// API 接口
app.get('/', (req, res) => res.send('ok'));
app.post('/api/create-meeting', (req, res) => {
  try {
    const room = meetingRoomManager.createRoom();
    res.json({ success: true, roomCode: room.code });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
app.post('/api/join-meeting', (req, res) => {
  try {
    const { roomCode } = req.body;
    if (!roomCode) {
      return res.status(400).json({ success: false, error: '缺少roomCode' });
    }
    const room = meetingRoomManager.getRoom(roomCode);
    if (!room) {
      return res.status(404).json({ success: false, error: '会议室不存在' });
    }
    res.json({ success: true, roomCode });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
app.post('/api/speech', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: '无音频' });
  res.json({ success: true, text: '测试转写结果' });
});
app.post('/api/recognize-shape', (req, res) => {
  try {
    const { points } = req.body;
    const s = new ShapeRecognitionService();
    res.json({ success: true, shape: s.beautifyShape(s.recognizeShape(points)) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
app.post('/api/generate-summary', async (req, res) => {
  try {
    const s = new SummaryService();
    const sum = await s.generateSummary(req.body.whiteboardContent, req.body.transcriptionHistory);
    res.json({ success: true, summary: sum });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// WebSocket
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomCode = url.searchParams.get('roomCode');
  if (!roomCode) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, roomCode);
  });
});

wss.on('connection', (ws, req, roomCode) => {
  ws.id = `socket_${Date.now()}`;
  ws.roomCode = roomCode;
  meetingRoomManager.joinRoom(roomCode, ws.id);
  clients.push(ws);

  ws.send(JSON.stringify({
    type: 'canvasState',
    data: meetingRoomManager.getCanvasState(roomCode)
  }));
  ws.send(JSON.stringify({
    type: 'socketId',
    data: ws.id
  }));

  let speechService = null;

  ws.on('message', (data, isBinary) => {
    try {
      if (isBinary) {
        if (speechService?.isConnected) {
          speechService.sendAudio(data);
        }
        meetingRoomManager.broadcastToRoom(roomCode, data, ws.id);
        return;
      }
      const parsed = JSON.parse(data.toString());
      if (parsed.type === 'draw') {
        const s = meetingRoomManager.getCanvasState(roomCode);
        s.push(parsed.data);
        meetingRoomManager.updateCanvasState(roomCode, s);
        meetingRoomManager.broadcastToRoom(roomCode, JSON.stringify({
          type: 'draw',
          data: parsed.data
        }), ws.id);
      }
      if (parsed.type === 'text') {
        const s = meetingRoomManager.getCanvasState(roomCode);
        s.push(parsed.data);
        meetingRoomManager.updateCanvasState(roomCode, s);
        meetingRoomManager.broadcastToRoom(roomCode, JSON.stringify({
          type: 'text',
          data: parsed.data
        }), ws.id);
      }
      if (parsed.type === 'clear') {
        meetingRoomManager.updateCanvasState(roomCode, []);
        meetingRoomManager.broadcastToRoom(roomCode, JSON.stringify({
          type: 'clear'
        }), ws.id);
      }
      if (parsed.type === 'canvasState') {
        meetingRoomManager.updateCanvasState(roomCode, parsed.data);
        meetingRoomManager.broadcastToRoom(roomCode, JSON.stringify({
          type: 'canvasState',
          data: parsed.data
        }), ws.id);
      }
      if (parsed.type === 'beautify') {
        const { strokeId, newElement } = parsed.data;
        const curr = meetingRoomManager.getCanvasState(roomCode);
        const room = meetingRoomManager.getRoom(roomCode);
        if (room && strokeId) {
          room.beautifyState = { originalState: [...curr], strokeId };
        }
        let updated = strokeId ? curr.filter(e => !(e.type === 'pen' && e.strokeId === strokeId)) : curr.filter(e => e.type !== 'pen');
        updated.push(newElement);
        meetingRoomManager.updateCanvasState(roomCode, updated);
        meetingRoomManager.broadcastToRoom(roomCode, JSON.stringify({
          type: 'beautify',
          data: parsed.data
        }), ws.id);
      }
      if (parsed.type === 'startTranscription') {
        if (!speechService) {
          speechService = new SpeechService();
        }
        speechService.connect(t => {
          const room = meetingRoomManager.getRoom(roomCode);
          const nick = room?.members.find(m => m.socketId === ws.id)?.nickname || '未知';
          meetingRoomManager.broadcastToRoom(roomCode, JSON.stringify({
            type: 'transcriptionResult',
            data: t,
            speaker: nick
          }));
        }, console.error, () => { });
      }
      if (parsed.type === 'stopTranscription') speechService?.sendEnd();
      if (parsed.type === 'updateNickname') {
        const m = meetingRoomManager.getRoom(roomCode)?.members.find(x => x.socketId === ws.id);
        if (m) m.nickname = parsed.data.nickname;
        ws.send(JSON.stringify({
          type: 'nicknameUpdated',
          data: parsed.data.nickname
        }));
      }
      if (parsed.type === 'undoBeautify') {
        const room = meetingRoomManager.getRoom(roomCode);
        if (room?.beautifyState) {
          meetingRoomManager.updateCanvasState(roomCode, room.beautifyState.originalState);
          room.beautifyState = null;
          meetingRoomManager.broadcastToRoom(roomCode, JSON.stringify({
            type: 'canvasState',
            data: meetingRoomManager.getCanvasState(roomCode)
          }), ws.id);
        }
      }
    } catch (e) { }
  });

  ws.on('close', () => {
    speechService?.close();
    meetingRoomManager.leaveRoom(ws.roomCode, ws.id);
    clients = clients.filter(c => c !== ws);
  });
  ws.on('error', () => { });
});

// 启动服务
const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 服务启动: http://192.168.248.168:${PORT}`);
  setInterval(() => meetingRoomManager.cleanupEmptyRooms(), 5 * 60 * 1000);
});