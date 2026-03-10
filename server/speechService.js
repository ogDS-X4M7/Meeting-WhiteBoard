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
    const date = new Date().toUTCString();
    const algorithm = 'hmac-sha256';
    const headers = 'host date request-line';
    const signatureOrigin = `host: iat-api.xfyun.cn\ndate: ${date}\nGET /v2/iat HTTP/1.1`;
    const signatureSha = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest('base64');
    const signature = crypto.createHmac('sha256', apiKey).update(signatureSha).digest('base64');
    const authorization = `api_key="${apiKey}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`;
    
    return `${url}?appid=${appId}&authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=iat-api.xfyun.cn`;
  }

  // 连接到讯飞API
  connect(onResult, onError, onClose) {
    this.callbacks.onResult = onResult;
    this.callbacks.onError = onError;
    this.callbacks.onClose = onClose;

    const wsUrl = this.generateWsUrl();
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('Connected to XFYun API');
      this.isConnected = true;
      this.sendInitParams();
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

  // 发送初始化参数
  sendInitParams() {
    if (!this.isConnected) return;

    const initParams = {
      common: {
        app_id: config.xfyun.appId
      },
      business: {
        language: 'zh_cn',
        domain: 'iat',
        accent: 'mandarin',
        vad_eos: 10000,
        dwa: 'wpgs'
      },
      data: {
        status: 0,
        format: 'audio/L16;rate=16000',
        encoding: 'raw',
        audio: ''
      }
    };

    this.ws.send(JSON.stringify(initParams));
  }

  // 发送音频数据
  sendAudio(audioData) {
    if (!this.isConnected) return;

    const audioParams = {
      data: {
        status: 1,
        format: 'audio/L16;rate=16000',
        encoding: 'raw',
        audio: audioData
      }
    };

    this.ws.send(JSON.stringify(audioParams));
  }

  // 发送结束标志
  sendEnd() {
    if (!this.isConnected) return;

    const endParams = {
      data: {
        status: 2,
        format: 'audio/L16;rate=16000',
        encoding: 'raw',
        audio: ''
      }
    };

    this.ws.send(JSON.stringify(endParams));
  }

  // 处理讯飞API返回的消息
  handleMessage(data) {
    try {
      const result = JSON.parse(data);
      if (result.code === 0) {
        if (result.data && result.data.result) {
          const text = result.data.result.ws.map(item => item.cw.map(cw => cw.w).join('')).join('');
          if (this.callbacks.onResult) {
            this.callbacks.onResult(text);
          }
        }
      } else {
        console.error('API error:', result);
        if (this.callbacks.onError) {
          this.callbacks.onError(result);
        }
      }
    } catch (error) {
      console.error('Error parsing message:', error);
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
