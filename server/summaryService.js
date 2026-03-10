// 会议摘要生成服务
// 使用讯飞星火大模型API

const axios = require('axios');
const config = require('./config');

class SummaryService {
  constructor() {
    this.appId = config.xfyun.appId;
    this.apiKey = config.xfyun.apiKey;
    this.apiSecret = config.xfyun.apiSecret;
  }

  // 生成会议摘要
  async generateSummary(whiteboardContent, transcriptionHistory) {
    try {
      // 构建请求数据
      const requestData = {
        app_id: this.appId,
        parameters: {
          chat: {
            domain: 'general',
            temperature: 0.5,
            max_tokens: 1000
          }
        },
        messages: [
          {
            role: 'system',
            content: '你是一个会议摘要助手，需要根据白板内容和语音转写记录生成会议摘要，包括核心结论、待办事项等。'
          },
          {
            role: 'user',
            content: `请根据以下内容生成会议摘要：\n\n白板内容：${whiteboardContent}\n\n语音转写记录：${transcriptionHistory}`
          }
        ]
      };

      // 由于需要真实的讯飞API密钥，这里暂时返回模拟数据
      // 实际使用时，需要调用讯飞星火大模型API
      return this.getMockSummary(whiteboardContent, transcriptionHistory);
      
      /* 实际API调用代码
      const response = await axios.post('https://spark-api.xf-yun.com/v3.1/chat', requestData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.generateAuthorizationHeader()
        }
      });

      return response.data.choices[0].message.content;
      */
    } catch (error) {
      console.error('Error generating summary:', error);
      return '生成摘要失败，请重试。';
    }
  }

  // 生成授权头
  generateAuthorizationHeader() {
    // 这里需要根据讯飞API的要求生成授权头
    // 具体实现请参考讯飞星火大模型API文档
    return 'Bearer mock-token';
  }

  // 生成模拟摘要
  getMockSummary(whiteboardContent, transcriptionHistory) {
    return `# 会议摘要\n\n## 核心结论\n1. 会议讨论了项目的整体架构设计\n2. 确定了技术栈选型：前端使用Vue.js，后端使用Node.js\n3. 制定了项目开发计划，分为三个阶段\n\n## 待办事项\n1. 完成前端白板组件的开发\n2. 实现实时通信功能\n3. 集成AI语音转写和图形识别功能\n4. 进行系统测试和性能优化\n\n## 会议参与者\n- 前端开发团队\n- 后端开发团队\n- 产品经理\n\n会议时间：${new Date().toLocaleString()}`;
  }
}

module.exports = SummaryService;