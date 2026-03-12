const SpeechService = require('./speechService');
const fs = require('fs');
const path = require('path');

// 测试脚本：使用MP3文件测试讯飞API
async function testSpeechAPI() {
  console.log('开始测试讯飞API...');
  
  // 创建语音服务实例
  const speechService = new SpeechService();
  
  // 连接到讯飞API
  speechService.connect(
    (text) => {
      console.log('收到转写结果:', text);
    },
    (error) => {
      console.error('API错误:', error);
    },
    () => {
      console.log('连接关闭');
    }
  );
  
  // 等待连接建立
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 检查是否连接成功
  if (!speechService.isConnected) {
    console.error('连接失败');
    return;
  }
  
  console.log('连接成功，开始发送音频数据...');
  
  // 这里可以添加MP3文件处理逻辑
  // 由于我们没有MP3文件，我们可以生成一个简单的测试音频
  // 生成16kHz, 16位, 单声道的PCM音频数据
  const sampleRate = 16000;
  const duration = 2; // 2秒
  const sampleCount = sampleRate * duration;
  const pcmData = new Int16Array(sampleCount);
  
  // 生成一个简单的正弦波
  for (let i = 0; i < sampleCount; i++) {
    const frequency = 440; // A4音符
    const amplitude = 32767; // 最大振幅
    pcmData[i] = Math.round(amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate));
  }
  
  // 分块发送音频数据
  const chunkSize = 1280; // 每40ms发送1280字节
  const chunkSamples = chunkSize / 2; // 16位PCM，每样本2字节
  for (let i = 0; i < pcmData.length; i += chunkSamples) {
    const chunk = pcmData.subarray(i, i + chunkSamples);
    speechService.sendAudio(Buffer.from(chunk.buffer));
    await new Promise(resolve => setTimeout(resolve, 400)); // 每400ms发送一次，进一步减慢速度
  }
  
  // 发送结束标志
  console.log('发送结束标志...');
  speechService.sendEnd();
  
  // 等待结果
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // 关闭连接
  speechService.close();
  console.log('测试完成');
}

testSpeechAPI().catch(console.error);
