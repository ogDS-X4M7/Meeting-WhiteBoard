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

// 语音转写API端点
app.post('/api/speech', upload.single('audio'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file provided' });
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
    console.error('Error processing speech request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 健康检查端点
app.get('/', (req, res) => {
  res.send('WebSocket server running');
});

// 图形识别API端点
app.post('/api/recognize-shape', (req, res) => {
  try {
    const { points } = req.body;
    
    if (!points || !Array.isArray(points)) {
      return res.status(400).json({ success: false, error: 'Invalid points data' });
    }
    
    const shapeRecognitionService = new ShapeRecognitionService();
    const recognizedShape = shapeRecognitionService.recognizeShape(points);
    const beautifiedShape = shapeRecognitionService.beautifyShape(recognizedShape);
    
    res.json({ success: true, shape: beautifiedShape });
  } catch (error) {
    console.error('Error recognizing shape:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 会议摘要生成API端点
app.post('/api/generate-summary', async (req, res) => {
  try {
    const { whiteboardContent, transcriptionHistory } = req.body;
    
    if (!whiteboardContent) {
      return res.status(400).json({ success: false, error: 'Whiteboard content is required' });
    }
    
    const summaryService = new SummaryService();
    const summary = await summaryService.generateSummary(whiteboardContent, transcriptionHistory || '');
    
    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

let canvasState = [];
let clients = [];

server.on('upgrade', (req, socket, head) => {
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
  
  // 发送当前画布状态给新连接的用户
  const canvasStateMessage = JSON.stringify({ type: 'canvasState', data: canvasState });
  sendWebSocketMessage(socket, canvasStateMessage);
  
  // 存储客户端连接
  clients.push(socket);
  
  console.log('a user connected');
  
  // 处理消息
  socket.on('data', (data) => {
    try {
      // 简单的WebSocket消息解析（仅处理文本消息）
      const message = parseWebSocketMessage(data);
      if (message) {
        const parsedData = JSON.parse(message);
        
        if (parsedData.type === 'draw') {
          canvasState.push(parsedData.data);
          // 广播给其他用户
          clients.forEach((client) => {
            if (client !== socket) {
              sendWebSocketMessage(client, JSON.stringify({ type: 'draw', data: parsedData.data }));
            }
          });
        } else if (parsedData.type === 'text') {
          canvasState.push(parsedData.data);
          // 广播给其他用户
          clients.forEach((client) => {
            if (client !== socket) {
              sendWebSocketMessage(client, JSON.stringify({ type: 'text', data: parsedData.data }));
            }
          });
        } else if (parsedData.type === 'clear') {
          canvasState = [];
          // 广播给除了发送者之外的所有用户
          clients.forEach((client) => {
            if (client !== socket) {
              sendWebSocketMessage(client, JSON.stringify({ type: 'clear' }));
            }
          });
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  socket.on('close', () => {
    clients = clients.filter(client => client !== socket);
    console.log('user disconnected');
  });
  
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// 发送WebSocket消息
function sendWebSocketMessage(socket, message) {
  const length = message.length;
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

// 解析WebSocket消息
function parseWebSocketMessage(data) {
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
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
