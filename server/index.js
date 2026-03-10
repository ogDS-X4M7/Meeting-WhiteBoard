const http = require('http');
const crypto = require('crypto');

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*'
  });
  res.end('WebSocket server running');
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
        } else if (parsedData.type === 'clear') {
          canvasState = [];
          // 广播给所有用户
          clients.forEach((client) => {
            sendWebSocketMessage(client, JSON.stringify({ type: 'clear' }));
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
