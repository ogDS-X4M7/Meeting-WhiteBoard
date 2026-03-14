// 测试摘要生成服务
const SummaryService = require('./summaryService');

async function testSummaryService() {
  try {
    const summaryService = new SummaryService();
    
    // 测试WebSocket URL生成
    const wsUrl = await summaryService.generateWebSocketUrl();
    console.log('WebSocket URL:', wsUrl);
    
    // 测试摘要生成
    const whiteboardContent = '项目计划：1. 前端开发 2. 后端开发 3. 测试部署';
    const transcriptionHistory = '张三：我们需要在下周完成前端开发。李四：后端开发预计需要两周时间。王五：测试部署安排在月底。';
    
    console.log('开始生成摘要...');
    const summary = await summaryService.generateSummary(whiteboardContent, transcriptionHistory);
    console.log('生成的摘要：');
    console.log(summary);
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testSummaryService();