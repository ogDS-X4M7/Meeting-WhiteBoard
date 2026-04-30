const http = require('http');
const express = require('express');
const multer = require('multer');
const { Server } = require('socket.io');
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
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

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
      beautifyStates: [],
      summaryState: false,
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
        beautifyState: null,
        beautifyStates: [],
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
}

const meetingRoomManager = new MeetingRoomManager();

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
    const { roomCode } = req.body;
    if (!roomCode) {
      return res.status(400).json({ success: false, error: '缺少roomCode' });
    }
    const room = meetingRoomManager.getRoom(roomCode);
    if (!room) {
      return res.status(404).json({ success: false, error: '会议室不存在' });
    }
    if (room.summaryState) {
      return res.status(400).json({ success: false, error: '摘要正在生成中，请稍等' });
    }
    room.summaryState = true;
    const s = new SummaryService();
    const sum = await s.generateSummary(req.body.whiteboardContent, req.body.transcriptionHistory);
    res.json({ success: true, summary: sum });
    setTimeout(() => {
      if (room.summaryState) room.summaryState = false;
    }, 3000);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Socket.IO 连接处理
io.on('connection', (socket) => {
  const roomCode = socket.handshake.query.roomCode;

  if (!roomCode) {
    socket.disconnect();
    return;
  }

  socket.roomCode = roomCode;
  meetingRoomManager.joinRoom(roomCode, socket.id);

  // 加入socket.io房间
  socket.join(roomCode);

  // 发送当前画布状态和socketId
  socket.emit('canvasState', meetingRoomManager.getCanvasState(roomCode));
  socket.emit('socketId', socket.id);

  let speechService = null;

  // 监听绘制事件
  socket.on('draw', (data) => {
    const s = meetingRoomManager.getCanvasState(roomCode);
    s.push(data);
    meetingRoomManager.updateCanvasState(roomCode, s);
    socket.to(roomCode).emit('draw', data);
  });

  // 监听文本事件
  socket.on('text', (data) => {
    const s = meetingRoomManager.getCanvasState(roomCode);
    s.push(data);
    meetingRoomManager.updateCanvasState(roomCode, s);
    socket.to(roomCode).emit('text', data);
  });

  // 监听清空事件
  socket.on('clear', () => {
    meetingRoomManager.updateCanvasState(roomCode, []);
    const room = meetingRoomManager.getRoom(roomCode);
    if (room) room.beautifyStates = [];
    socket.to(roomCode).emit('clear');
  });

  // 监听画布状态同步事件
  socket.on('canvasState', (data) => {
    meetingRoomManager.updateCanvasState(roomCode, data);
    socket.to(roomCode).emit('canvasState', data);
  });

  // 监听美化事件
  socket.on('beautify', (data) => {
    const { strokeId, newElement } = data;
    const curr = meetingRoomManager.getCanvasState(roomCode);
    const room = meetingRoomManager.getRoom(roomCode);

    if (room && strokeId) {
      let item = { state: [], strokeId };
      curr.forEach(e => {
        if (e.type === 'pen' && e.strokeId === strokeId) {
          item.state.push(e);
        }
      });
      room.beautifyStates.push(item);
    }

    let updated = curr.filter(e => !(e.type === 'pen' && e.strokeId === strokeId));
    updated.push(newElement);
    meetingRoomManager.updateCanvasState(roomCode, updated);
    socket.to(roomCode).emit('beautify', data);
  });

  // 监听开始转写事件
  socket.on('startTranscription', () => {
    if (!speechService) {
      speechService = new SpeechService();
    }
    speechService.connect(t => {
      const room = meetingRoomManager.getRoom(roomCode);
      const nick = room?.members.find(m => m.socketId === socket.id)?.nickname || '未知';
      io.to(roomCode).emit('transcriptionResult', { data: t, speaker: nick });
    }, console.error, () => { });
  });

  // 监听停止转写事件
  socket.on('stopTranscription', () => {
    speechService?.sendEnd();
  });

  // 监听更新昵称事件
  socket.on('updateNickname', (data) => {
    const m = meetingRoomManager.getRoom(roomCode)?.members.find(x => x.socketId === socket.id);
    if (m) m.nickname = data.nickname;
    socket.emit('nicknameUpdated', data.nickname);
  });

  // 监听撤销美化事件
  socket.on('undoBeautify', (data) => {
    const room = meetingRoomManager.getRoom(roomCode);
    const { strokeId } = data;
    const curr = meetingRoomManager.getCanvasState(roomCode);

    if (room?.beautifyStates.length) {
      let getItem = room.beautifyStates.find(item => item.strokeId === strokeId);
      if (getItem) {
        let updated = curr.filter(e => !(e.strokeId === strokeId));
        updated.push(...getItem.state);
        room.beautifyStates = room.beautifyStates.filter(item => item.strokeId !== strokeId);
        meetingRoomManager.updateCanvasState(roomCode, updated);
        socket.to(roomCode).emit('canvasState', meetingRoomManager.getCanvasState(roomCode));
      } else {
        socket.emit('errorBeautify', '撤销的美化操作不存在，strokeId匹配异常');
      }
    }
  });

  // 监听摘要事件
  socket.on('summary', (data) => {
    socket.to(roomCode).emit('summary', data);
    const room = meetingRoomManager.getRoom(roomCode);
    if (room) room.summaryState = false;
  });

  // 监听二进制音频数据
  socket.on('audio', (data) => {
    if (speechService?.isConnected) {
      speechService.sendAudio(data);
    }
    socket.to(roomCode).emit('audio', data);
  });

  // 监听断开连接
  socket.on('disconnect', () => {
    speechService?.close();
    meetingRoomManager.leaveRoom(roomCode, socket.id);
  });

  socket.on('error', (err) => {
    console.error('Socket error:', err);
  });
});

// 启动服务
const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 服务启动: http://192.168.2.9:${PORT}`);
  setInterval(() => meetingRoomManager.cleanupEmptyRooms(), 5 * 60 * 1000);
});