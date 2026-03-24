const http = require('http');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const SpeechService = require('./speechService');
const ShapeRecognitionService = require('./shapeRecognitionService');
const SummaryService = require('./summaryService');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 配置CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// 配置multer用于文件上传
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const server = http.createServer(app);

// 会议室管理
class MeetingRoomManager {
  constructor() {
    this.rooms = new Map();
  }

  // 生成4-6位随机数字作为会议室快捷号
  generateRoomCode() {
    let code;
    do {
      // 生成4-6位随机数字
      const length = Math.floor(Math.random() * 3) + 4; // 4-6位
      code = '';
      for (let i = 0; i < length; i++) {
        code += Math.floor(Math.random() * 10);
      }
    } while (this.rooms.has(code)); // 确保唯一性
    return code;
  }

  // 创建会议室
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

  // 获取会议室
  getRoom(code) {
    return this.rooms.get(code);
  }

  // 加入会议室
  joinRoom(code, socketId) {
    let room = this.rooms.get(code);

    // 检查会议室是否存在且为空
    if (room && room.members.length === 0) {
      // 如果会议室存在但为空，创建一个新的空会议室
      console.log(`会议室${code}为空，创建一个新的空会议室`);
      room = {
        code,
        createdAt: new Date(),
        lastActivityTime: new Date(),
        members: [],
        canvasState: [],
        beautifyState: null
      };
      this.rooms.set(code, room);
    } else if (!room) {
      // 如果会议室不存在，创建一个新的
      room = {
        code,
        createdAt: new Date(),
        lastActivityTime: new Date(),
        members: [],
        canvasState: [],
        beautifyState: null
      };
      this.rooms.set(code, room);
      console.log(`会议室${code}创建成功`);
    } else {
      // 更新最后活动时间
      room.lastActivityTime = new Date();
    }

    // 检查是否已加入
    const existingMember = room.members.find(member => member.socketId === socketId);
    if (existingMember) {
      return room;
    }

    // 添加新成员
    const member = {
      id: `user_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      socketId,
      joinedAt: new Date(),
      nickname: `用户${Math.floor(Math.random() * 1000)}`
    };
    room.members.push(member);
    return room;
  }

  // 离开会议室
  leaveRoom(code, socketId) {
    const room = this.rooms.get(code);
    if (!room) {
      console.log(`会议室${code}不存在，无法离开`);
      return;
    }

    console.log(`会议室${code}离开成功`);
    room.members = room.members.filter(member => member.socketId !== socketId);
    console.log(`离开后，会议室${code}成员数：${room.members.length}`);

    // 如果会议室为空，删除会议室
    if (room.members.length === 0) {
      console.log(`会议室${code}为空，删除`);
      this.rooms.delete(code);
      console.log(`会议室${code}删除成功`);
    }
  }

  // 定期检查并清理无人或长时间无活动的会议室
  cleanupEmptyRooms() {
    const now = new Date();
    const timeout = 10 * 60 * 1000; // 10分钟超时
    let deletedRooms = 0;

    for (const [code, room] of this.rooms.entries()) {
      // 检查会议室是否为空或长时间无活动
      const isEmpty = room.members.length === 0;
      const isInactive = now - room.lastActivityTime > timeout;

      if (isEmpty || isInactive) {
        console.log(`会议室${code}${isEmpty ? '为空' : '超时'}`);
        this.rooms.delete(code);
        deletedRooms++;
      }
    }

    if (deletedRooms > 0) {
      console.log(`删除${deletedRooms}个会议室成功`);
    }
  }

  // 更新会议室画布状态
  updateCanvasState(code, state) {
    const room = this.rooms.get(code);
    if (room) {
      room.canvasState = state;
      room.lastActivityTime = new Date();
    }
  }

  // 获取会议室画布状态
  getCanvasState(code) {
    const room = this.rooms.get(code);
    return room ? room.canvasState : [];
  }

  // 广播消息到会议室
  broadcastToRoom(code, message, excludeSocketId = null) {
    const room = this.rooms.get(code);
    if (!room) {
      console.log(`会议室${code}不存在，无法广播消息`);
      return;
    }

    console.log(`会议室${code}成员数：${room.members.length}，排除socketId：${excludeSocketId}`);
    room.members.forEach(member => {
      if (member.socketId !== excludeSocketId) {
        const socket = clients.find(client => client.id === member.socketId);
        if (socket) {
          console.log(`向socket${member.socketId}发送消息`);
          // 检查消息类型，如果是二进制数据，使用 WebSocket 二进制消息格式发送
          if (Buffer.isBuffer(message)) {
            sendWebSocketBinaryMessage(socket, message);
          } else {
            sendWebSocketMessage(socket, message);
          }
        } else {
          console.log(`socket${member.socketId}不存在`);
        }
      }
    });
  }
}

const meetingRoomManager = new MeetingRoomManager();
let clients = [];

// 语音转写API端点
app.post('/api/speech', upload.single('audio'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请上传音频文件' });
    }

    // 这里应该使用SpeechService处理音频并返回转写结果
    // 由于需要真实的讯飞API密钥，这里暂时返回模拟数据
    setTimeout(() => {
      res.json({ success: true, text: '这是一段模拟的语音转写结果，用于测试功能。' });
    }, 1000);

    // 实际使用时的代码：
    /*
    const speechService = new SpeechService();
    speechService.connect(
      (text) => {
        res.json({ success: true, text });
        speechService.close();
      },
      (error) => {
        res.status(500).json({ success: false, error: error.message });
        speechService.close();
      },
      () => {
        console.log('Speech service closed');
      }
    );
    
    // 处理音频数据并发送到讯飞API
    // 注意：这里需要根据实际音频格式进行处理
    */
  } catch (error) {
    console.error('处理语音请求时出错:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 健康检查端点
app.get('/', (req, res) => {
  res.send('websocket服务器运行中');
});

// 图形识别API端点
app.post('/api/recognize-shape', (req, res) => {
  try {
    const { points } = req.body;

    if (!points || !Array.isArray(points)) {
      return res.status(400).json({ success: false, error: '请提供有效点数据' });
    }

    const shapeRecognitionService = new ShapeRecognitionService();
    const recognizedShape = shapeRecognitionService.recognizeShape(points);
    const beautifiedShape = shapeRecognitionService.beautifyShape(recognizedShape);

    res.json({ success: true, shape: beautifiedShape });
  } catch (error) {
    console.error('识别形状时出错:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 会议摘要生成API端点
app.post('/api/generate-summary', async (req, res) => {
  try {
    const { whiteboardContent, transcriptionHistory } = req.body;

    if (!whiteboardContent) {
      return res.status(400).json({ success: false, error: '请提供白板内容' });
    }

    const summaryService = new SummaryService();
    const summary = await summaryService.generateSummary(whiteboardContent, transcriptionHistory || '');

    res.json({ success: true, summary });
  } catch (error) {
    console.error('生成摘要时出错:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建会议API端点
app.post('/api/create-meeting', (req, res) => {
  try {
    const room = meetingRoomManager.createRoom();
    res.json({ success: true, roomCode: room.code });
  } catch (error) {
    console.error('创建会议室时出错:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 加入会议API端点
app.post('/api/join-meeting', (req, res) => {
  try {
    const { roomCode } = req.body;

    if (!roomCode) {
      return res.status(400).json({ success: false, error: '请提供会议室代码（roomCode）' });
    }

    const room = meetingRoomManager.getRoom(roomCode);
    if (!room) {
      return res.status(404).json({ success: false, error: '会议室不存在（roomCode）' });
    }

    res.json({ success: true, roomCode: room.code });
  } catch (error) {
    console.error('加入会议室时出错:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 离开会议API端点
app.post('/api/leave-meeting', (req, res) => {
  try {
    const { roomCode, socketId } = req.body;

    if (!roomCode || !socketId) {
      return res.status(400).json({ success: false, error: '请提供会议室代码（roomCode）和socketID（socketId）' });
    }

    // 从会议室中移除用户
    meetingRoomManager.leaveRoom(roomCode, socketId);

    res.json({ success: true, message: '离开会议室成功' });
  } catch (error) {
    console.error('离开会议室时出错:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

server.on('upgrade', (req, socket, head) => {
  // 从URL中提取会议室代码
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomCode = url.searchParams.get('roomCode');

  if (!roomCode) {
    socket.write('HTTP/1.1 400 Bad Request\\r\n\r\n');
    socket.destroy();
    return;
  }

  // 处理WebSocket握手
  const key = req.headers['sec-websocket-key'];
  const hash = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');

  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${hash}`,
    'Access-Control-Allow-Origin: *'
  ];

  socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');

  // 为socket分配唯一ID
  socket.id = `socket_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  // 加入会议室
  const room = meetingRoomManager.joinRoom(roomCode, socket.id);
  // 现在 joinRoom 总是会返回一个房间，不需要检查是否为 null

  // 存储客户端连接
  clients.push(socket);
  socket.roomCode = roomCode;

  console.log(`用户连接到会议室 ${roomCode}`);

  // 发送当前画布状态给新连接的用户
  const canvasState = meetingRoomManager.getCanvasState(roomCode);
  const canvasStateMessage = JSON.stringify({ type: 'canvasState', data: canvasState });
  sendWebSocketMessage(socket, canvasStateMessage);

  // 发送 socketId 给客户端
  const socketIdMessage = JSON.stringify({ type: 'socketId', data: socket.id });
  sendWebSocketMessage(socket, socketIdMessage);

  // 存储语音转写服务实例
  let speechService = null;

  // 处理消息
  socket.on('data', (data) => {
    try {
      // 检查是否是二进制数据（音频数据）
      if (Buffer.isBuffer(data) && data.length > 0) {
        const firstByte = data[0];
        const opCode = firstByte & 0x0F;
        console.log('收到数据，长度:', data.length, 'opCode:', opCode);
        // WebSocket二进制消息的opCode是2
        if (opCode === 2) {
          // 处理音频数据
          if (speechService && speechService.isConnected) {
            console.log('收到音频数据，长度:', data.length);
            console.log('音频数据前10个字节:', data.slice(0, 10).toString('hex'));
            speechService.sendAudio(data);
            console.log('音频数据已发送到讯飞API');
          } else {
            console.log('音频数据已收到，但语音服务未连接');
          }

          // 转发音频数据给会议室中的其他客户端
          meetingRoomManager.broadcastToRoom(roomCode, data, socket.id);
          return;
        } else {
          console.log('收到非音频数据，opCode:', opCode);
        }
      }

      // 简单的WebSocket消息解析（仅处理文本消息）
      const message = parseWebSocketMessage(data);
      if (message && message !== 'undefined') {
        try {
          const parsedData = JSON.parse(message);

          if (parsedData.type === 'draw') {
            // 更新会议室画布状态
            const currentState = meetingRoomManager.getCanvasState(roomCode);
            currentState.push(parsedData.data);
            meetingRoomManager.updateCanvasState(roomCode, currentState);

            // 广播给同一会议室的其他用户
            meetingRoomManager.broadcastToRoom(roomCode, JSON.stringify({ type: 'draw', data: parsedData.data }), socket.id);
          } else if (parsedData.type === 'text') {
            // 更新会议室画布状态
            const currentState = meetingRoomManager.getCanvasState(roomCode);
            currentState.push(parsedData.data);
            meetingRoomManager.updateCanvasState(roomCode, currentState);

            // 广播给同一会议室的其他用户
            meetingRoomManager.broadcastToRoom(roomCode, JSON.stringify({ type: 'text', data: parsedData.data }), socket.id);
          } else if (parsedData.type === 'clear') {
            // 清空会议室画布状态
            meetingRoomManager.updateCanvasState(roomCode, []);

            // 广播给同一会议室的其他用户
            meetingRoomManager.broadcastToRoom(roomCode, JSON.stringify({ type: 'clear' }), socket.id);
          } else if (parsedData.type === 'canvasState') {
            // 更新会议室画布状态
            console.log(`收到socket ${socket.id} 更新会议室 ${roomCode} 的画布状态，元素数量: ${parsedData.data.length}`);
            meetingRoomManager.updateCanvasState(roomCode, parsedData.data);

            // 广播给同一会议室的其他用户
            console.log(`广播更新会议室 ${roomCode}, 排除socket ${socket.id}`);
            meetingRoomManager.broadcastToRoom(roomCode, JSON.stringify({ type: 'canvasState', data: parsedData.data }), socket.id);
          } else if (parsedData.type === 'beautify') {
            // 处理美化操作
            const { strokeId, newElement } = parsedData.data;

            // 更新会议室画布状态
            const currentState = meetingRoomManager.getCanvasState(roomCode);

            // 保存原始状态，用于撤销美化
            if (strokeId) {
              // 保存原始状态到会议室对象中
              const room = meetingRoomManager.getRoom(roomCode);
              if (room) {
                room.beautifyState = {
                  originalState: [...currentState],
                  strokeId: strokeId
                };
              }
            }

            // 移除与当前绘制相关的所有pen元素（使用strokeId）
            let updatedState;
            if (strokeId) {
              updatedState = currentState.filter(element => !(element.type === 'pen' && element.strokeId === strokeId));
            } else {
              // 如果没有strokeId，尝试移除最后一个pen元素
              const penElements = currentState.filter(element => element.type === 'pen');
              const lastPenElement = penElements[penElements.length - 1];

              if (lastPenElement) {
                updatedState = currentState.filter(element => element !== lastPenElement);
              } else {
                updatedState = [...currentState];
              }
            }

            // 添加美化后的元素
            updatedState.push(newElement);
            meetingRoomManager.updateCanvasState(roomCode, updatedState);

            // 广播美化操作给同一会议室的其他用户
            meetingRoomManager.broadcastToRoom(roomCode, JSON.stringify({ type: 'beautify', data: parsedData.data }), socket.id);
          } else if (parsedData.type === 'startTranscription') {
            // 开始语音转写
            if (!speechService) {
              speechService = new SpeechService();
            }

            // 启动定时器，每5秒检查一次是否有转写结果
            const transcriptionTimer = setInterval(() => {
              // 发送空结果
              sendWebSocketMessage(socket, JSON.stringify({ type: 'transcriptionResult', data: '' }));
            }, 5000);

            speechService.connect(
              (text) => {
                // 发送转写结果给客户端
                const room = meetingRoomManager.getRoom(roomCode);
                if (room) {
                  const member = room.members.find(m => m.socketId === socket.id);
                  const nickname = member ? member.nickname : '未知用户';
                  // 广播转写结果给同一会议室的所有客户端
                  meetingRoomManager.broadcastToRoom(roomCode, JSON.stringify({
                    type: 'transcriptionResult',
                    data: text,
                    speaker: nickname
                  }));
                }
              },
              (error) => {
                console.error('语音转写服务出错:', error);
                sendWebSocketMessage(socket, JSON.stringify({ type: 'transcriptionError', data: error.message }));
                // 清除定时器
                clearInterval(transcriptionTimer);
              },
              () => {
                console.log('语音转写服务已关闭');
                // 清除定时器
                clearInterval(transcriptionTimer);
              }
            );
          } else if (parsedData.type === 'stopTranscription') {
            // 停止语音转写
            if (speechService) {
              speechService.sendEnd();
              // 不需要立即关闭连接，等待服务端返回最终结果

              // 设置一个定时器，如果5秒后还没有收到转写结果，发送空结果
              setTimeout(() => {
                // 检查是否已经收到过转写结果
                if (speechService) {
                  // 发送空结果
                  sendWebSocketMessage(socket, JSON.stringify({ type: 'transcriptionResult', data: '' }));
                }
              }, 5000);
            }
          } else if (parsedData.type === 'updateNickname') {
            // 更新用户昵称
            const { nickname } = parsedData.data;
            if (nickname) {
              // 找到当前用户
              const room = meetingRoomManager.getRoom(roomCode);
              if (room) {
                const member = room.members.find(m => m.socketId === socket.id);
                if (member) {
                  member.nickname = nickname;
                  console.log(`用户 ${socket.id} 更新昵称为 ${nickname}`);
                  // 发送确认消息给客户端
                  sendWebSocketMessage(socket, JSON.stringify({ type: 'nicknameUpdated', data: nickname }));
                }
              }
            }
          } else if (parsedData.type === 'undoBeautify') {
            // 处理撤销美化操作
            console.log(`用户 ${socket.id} 撤销会议室 ${roomCode} 的美化操作`);

            // 获取会议室对象
            const room = meetingRoomManager.getRoom(roomCode);
            if (room && room.beautifyState) {
              // 恢复到之前保存的原始状态
              const originalState = room.beautifyState.originalState;
              meetingRoomManager.updateCanvasState(roomCode, originalState);

              // 清除保存的美化状态
              room.beautifyState = null;

              // 广播canvasState消息给同一会议室的其他用户
              console.log(`广播更新会议室 ${roomCode}, 排除socket ${socket.id}`);
              meetingRoomManager.broadcastToRoom(roomCode, JSON.stringify({ type: 'canvasState', data: originalState }), socket.id);
            } else {
              console.log(`会议室 ${roomCode} 未找到美化状态`);
            }
          }
        } catch (error) {
          console.error('解析消息出错:', error);
        }
      }
    } catch (error) {
      console.error('处理消息出错:', error);
    }
  });

  socket.on('close', () => {
    // 关闭语音转写服务
    if (speechService) {
      speechService.close();
      speechService = null;
    }

    // 从会议室中移除用户
    if (socket.roomCode) {
      console.log(`用户与会议室 ${socket.roomCode} 断开连接`);
      meetingRoomManager.leaveRoom(socket.roomCode, socket.id);
      console.log(`用户与会议室 ${socket.roomCode} 断开连接`);
    }

    // 从客户端列表中移除
    clients = clients.filter(client => client !== socket);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// 发送WebSocket消息
function sendWebSocketMessage(socket, message) {
  const length = Buffer.byteLength(message, 'utf8');
  let buffer;

  if (length < 126) {
    buffer = Buffer.alloc(2 + length);
    buffer[0] = 0x81; // 文本消息，FIN=1
    buffer[1] = length;
  } else if (length < 65536) {
    buffer = Buffer.alloc(4 + length);
    buffer[0] = 0x81;
    buffer[1] = 126;
    buffer.writeUInt16BE(length, 2);
  } else {
    buffer = Buffer.alloc(10 + length);
    buffer[0] = 0x81;
    buffer[1] = 127;
    buffer.writeBigUInt64BE(BigInt(length), 2);
  }

  buffer.write(message, length < 126 ? 2 : length < 65536 ? 4 : 10);
  socket.write(buffer);
}

// 发送WebSocket二进制消息
function sendWebSocketBinaryMessage(socket, binaryData) {
  const length = binaryData.length;
  let buffer;

  if (length < 126) {
    buffer = Buffer.alloc(2 + length);
    buffer[0] = 0x82; // 二进制消息，FIN=1
    buffer[1] = length;
  } else if (length < 65536) {
    buffer = Buffer.alloc(4 + length);
    buffer[0] = 0x82;
    buffer[1] = 126;
    buffer.writeUInt16BE(length, 2);
  } else {
    buffer = Buffer.alloc(10 + length);
    buffer[0] = 0x82;
    buffer[1] = 127;
    buffer.writeBigUInt64BE(BigInt(length), 2);
  }

  // 复制二进制数据到缓冲区
  binaryData.copy(buffer, length < 126 ? 2 : length < 65536 ? 4 : 10);
  socket.write(buffer);
}

// 解析WebSocket消息
function parseWebSocketMessage(data) {
  try {
    const firstByte = data[0];
    const isFinal = (firstByte & 0x80) !== 0;
    const opCode = firstByte & 0x0F;

    if (opCode !== 1) return null; // 仅处理文本消息

    const secondByte = data[1];
    const isMasked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7F;
    let offset = 2;

    if (payloadLength === 126) {
      payloadLength = data.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      payloadLength = Number(data.readBigUInt64BE(offset));
      offset += 8;
    }

    if (isMasked) {
      const mask = data.slice(offset, offset + 4);
      offset += 4;
      const payload = data.slice(offset, offset + payloadLength);

      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= mask[i % 4];
      }

      return payload.toString('utf8');
    } else {
      return data.slice(offset, offset + payloadLength).toString('utf8');
    }
  } catch (error) {
    console.error('解析消息出错:', error);
    return null;
  }
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // 每5分钟检查并清理一次无人的会议室
  setInterval(() => {
    meetingRoomManager.cleanupEmptyRooms();
  }, 5 * 60 * 1000);
  console.log('每5分钟清理一次无人的会议室');
});
