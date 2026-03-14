// 会议摘要生成服务
// 使用讯飞星火大模型API

const WebSocket = require('ws');
const CryptoJS = require('crypto-js');
const config = require('./config');

class SummaryService {
  constructor() {
    this.appId = config.xfyun.appId;
    this.apiKey = config.xfyun.apiKey;
    this.apiSecret = config.xfyun.apiSecret;
  }

  // 生成会议摘要
  async generateSummary(whiteboardContent, transcriptionHistory) {
    return new Promise(async (resolve, reject) => {
      try {
        // 生成WebSocket连接URL
        const wsUrl = await this.generateWebSocketUrl();

        // 构建请求数据
        const requestData = {
          header: {
            app_id: this.appId,
            uid: 'user_' + Date.now()
          },
          parameter: {
            chat: {
              domain: '4.0Ultra',
              temperature: 0.5,
              max_tokens: 32768
            }
          },
          payload: {
            message: {
              text: [
                {
                  role: 'system',
                  content: '你是一个会议摘要助手，需要根据语音转写记录和白板内容生成会议摘要，包括核心结论、待办事项等。'
                },
                {
                  role: 'user',
                  content: `请根据以下内容生成会议摘要：\n\n语音转写记录：${transcriptionHistory}\n\n白板内容：${whiteboardContent}`
                }
              ]
            }
          }
        };

        // 建立WebSocket连接
        const ws = new WebSocket(wsUrl);

        let summary = '';
        let isComplete = false;

        ws.on('open', () => {
          // 发送请求
          ws.send(JSON.stringify(requestData));
        });

        ws.on('message', (data) => {
          try {
            const response = JSON.parse(data);

            // 处理响应
            if (response.header.code === 0) {
              // 提取摘要内容
              if (response.payload && response.payload.choices && response.payload.choices.text) {
                response.payload.choices.text.forEach(item => {
                  summary += item.content;
                });
              }

              // 检查是否完成
              if (response.header.status === 2) {
                isComplete = true;
                ws.close();
                resolve(summary);
              }
            } else {
              console.error('API Error:', response.header.message);
              ws.close();
              reject(new Error(response.header.message));
            }
          } catch (error) {
            console.error('Error parsing response:', error);
          }
        });

        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        });

        ws.on('close', () => {
          if (!isComplete) {
            reject(new Error('WebSocket connection closed before completing'));
          }
        });

        // 超时处理
        setTimeout(() => {
          if (!isComplete) {
            ws.close();
            reject(new Error('Request timeout'));
          }
        }, 60000);

      } catch (error) {
        console.error('Error generating summary:', error);
        resolve('生成摘要失败，请重试。');
      }
    });
  }

  // 生成WebSocket连接URL
  async generateWebSocketUrl() {
    return new Promise((resolve, reject) => {
      try {
        const apiKey = this.apiKey;
        const apiSecret = this.apiSecret;
        const url = config.xfyun.spark.url;
        const host = new URL(url).host;
        const date = new Date().toGMTString();
        const algorithm = 'hmac-sha256';
        const headers = 'host date request-line';
        const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v4.0/chat HTTP/1.1`;
        const signatureSha = CryptoJS.HmacSHA256(signatureOrigin, apiSecret);
        const signature = CryptoJS.enc.Base64.stringify(signatureSha);
        const authorizationOrigin = `api_key="${apiKey}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`;
        const authorization = Buffer.from(authorizationOrigin).toString('base64');
        const finalUrl = `${url}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`;
        resolve(finalUrl);
      } catch (error) {
        reject(error);
      }
    });
  }

  // 生成模拟摘要
  getMockSummary(whiteboardContent, transcriptionHistory) {
    return `# 会议摘要\n\n## 核心结论\n1. 会议讨论了项目的整体架构设计\n2. 确定了技术栈选型：前端使用Vue.js，后端使用Node.js\n3. 制定了项目开发计划，分为三个阶段\n\n## 待办事项\n1. 完成前端白板组件的开发\n2. 实现实时通信功能\n3. 集成AI语音转写和图形识别功能\n4. 进行系统测试和性能优化\n\n## 会议参与者\n- 前端开发团队\n- 后端开发团队\n- 产品经理\n\n会议时间：${new Date().toLocaleString()}`;
  }
}

module.exports = SummaryService;