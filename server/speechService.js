const WebSocket = require('ws');
const crypto = require('crypto');
const config = require('./config');

class SpeechService {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.callbacks = {
      onResult: null,
      onError: null,
      onClose: null
    };
  }

  // 生成WebSocket连接参数
  generateWsUrl() {
    const { appId, apiKey, apiSecret, url } = config.xfyun;

    // 生成UTC时间戳，格式：2025-09-04T15:38:07+0800
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const offsetHours = Math.abs(Math.floor(offset / 60));
    const offsetMinutes = Math.abs(offset % 60);
    const offsetSign = offset < 0 ? '+' : '-';
    const formattedOffset = `${offsetSign}${offsetHours.toString().padStart(2, '0')}${offsetMinutes.toString().padStart(2, '0')}`;

    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    const utc = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${formattedOffset}`;

    // 构造参数对象
    const params = {
      appId: appId,
      accessKeyId: apiKey,
      utc: utc,
      lang: 'autodialect',
      audio_encode: 'pcm_s16le',
      samplerate: 16000
    };

    // 对参数按key进行升序排序
    const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});

    // 生成baseString
    let baseString = '';
    for (const [key, value] of Object.entries(sortedParams)) {
      baseString += `${encodeURIComponent(key)}=${encodeURIComponent(value)}&`;
    }
    baseString = baseString.slice(0, -1); // 移除最后一个&符号

    // 生成signature
    const hmac = crypto.createHmac('sha1', apiSecret);
    hmac.update(baseString);
    const signature = hmac.digest('base64');

    // 构造最终的WebSocket URL
    let wsUrl = `${url}?`;
    for (const [key, value] of Object.entries(sortedParams)) {
      wsUrl += `${encodeURIComponent(key)}=${encodeURIComponent(value)}&`;
    }
    wsUrl += `signature=${encodeURIComponent(signature)}`;

    return wsUrl;
  }

  // 连接到讯飞API
  connect(onResult, onError, onClose) {
    this.callbacks.onResult = onResult;
    this.callbacks.onError = onError;
    this.callbacks.onClose = onClose;

    const wsUrl = this.generateWsUrl();
    console.log('Connecting to:', wsUrl);
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('Connected to XFYun API');
      this.isConnected = true;
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data);
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    });

    this.ws.on('close', () => {
      console.log('Disconnected from XFYun API');
      this.isConnected = false;
      if (this.callbacks.onClose) {
        this.callbacks.onClose();
      }
    });
  }

  // 发送音频数据
  sendAudio(webSocketFrame) {
    if (!this.isConnected) return;

    // 提取WebSocket帧中的音频数据
    let audioData = webSocketFrame;
    if (Buffer.isBuffer(webSocketFrame)) {
      // 解析WebSocket帧
      const firstByte = webSocketFrame[0];
      const isFinal = (firstByte & 0x80) !== 0;
      const opCode = firstByte & 0x0F;

      if (opCode === 2) { // 二进制消息
        const secondByte = webSocketFrame[1];
        const isMasked = (secondByte & 0x80) !== 0;
        let payloadLength = secondByte & 0x7F;
        let offset = 2;

        if (payloadLength === 126) {
          payloadLength = webSocketFrame.readUInt16BE(offset);
          offset += 2;
        } else if (payloadLength === 127) {
          payloadLength = Number(webSocketFrame.readBigUInt64BE(offset));
          offset += 8;
        }

        if (isMasked) {
          const mask = webSocketFrame.slice(offset, offset + 4);
          offset += 4;
          const payload = webSocketFrame.slice(offset, offset + payloadLength);

          // 解掩码
          for (let i = 0; i < payload.length; i++) {
            payload[i] ^= mask[i % 4];
          }

          audioData = payload;
        } else {
          audioData = webSocketFrame.slice(offset, offset + payloadLength);
        }
      }
    }

    // 发送提取出的音频数据
    if (audioData && audioData.length > 0) {
      this.ws.send(audioData, { binary: true });
    }
  }

  // 发送结束标志
  sendEnd() {
    if (!this.isConnected) return;

    // 生成唯一的sessionId
    const sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    // 发送结束标志，符合文档要求的格式
    const endMessage = JSON.stringify({ end: true, sessionId: sessionId });
    console.log('发送结束标志:', endMessage);
    this.ws.send(endMessage);
  }

  // 处理讯飞API返回的消息
  handleMessage(data) {
    try {
      console.log('收到讯飞API消息:', data);
      // 尝试解析JSON数据
      const result = JSON.parse(data);

      console.log('解析后的消息:', result);

      // 检查消息格式
      if (result.msg_type === 'action') {
        const actionData = result.data;
        if (actionData.action === 'started') {
          console.log('连接成功:', actionData);
        } else if (actionData.action === 'end') {
          console.log('会话结束:', actionData);
          if (actionData.code !== '0') {
            console.error('API错误:', actionData);
            if (this.callbacks.onError) {
              this.callbacks.onError(actionData);
            }
          }
        } else {
          console.log('未知动作类型:', actionData);
        }
      } else if (result.msg_type === 'result') {
        const resultData = result.data;
        // 处理不同格式的返回结果
        if (resultData.text) {
          // 直接返回文本
          const text = resultData.text;
          console.log('转写结果:', text || '无内容');
          if (this.callbacks.onResult) {
            this.callbacks.onResult(text);
          }
        } else if (resultData.cn && resultData.cn.st && resultData.cn.st.rt) {
          // 处理嵌套格式的返回结果
          const rt = resultData.cn.st.rt;
          if (rt && rt.length > 0) {
            let text = '';
            rt.forEach(item => {
              if (item.ws && item.ws.length > 0) {
                item.ws.forEach(ws => {
                  if (ws.cw && ws.cw.length > 0) {
                    ws.cw.forEach(cw => {
                      if (cw.w) {
                        text += cw.w;
                      }
                    });
                  }
                });
              }
            });
            console.log('转写结果:', text || '无内容');
            if (this.callbacks.onResult) {
              this.callbacks.onResult(text);
            }
          } else {
            console.log('转写结果: 无内容');
            if (this.callbacks.onResult) {
              this.callbacks.onResult('');
            }
          }
        } else {
          console.log('转写结果: 无内容');
          if (this.callbacks.onResult) {
            this.callbacks.onResult('');
          }
        }
      } else {
        console.log('未知消息类型:', result);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
      console.error('原始消息:', data);
    }
  }

  // 关闭连接
  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

module.exports = SpeechService;
