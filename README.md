# 智能白板系统

一个基于 WebSocket 的实时协作白板系统，支持语音转写功能。

## 功能特性

- 实时协作白板，支持多人同时绘制
- 支持画笔、橡皮、文本、矩形、圆形、菱形、箭头等工具
- 图形美化功能，自动识别和美化手绘图形
- 语音转写功能，使用讯飞星火 API 实现实时语音转写
- 会议摘要生成功能，基于白板内容和语音转写结果生成会议摘要
- 文本输入功能改进：
  - 支持画布上直接生成文本框
  - 文本框大小调整和位置拖动
  - 文本自动换行，支持垂直排列
  - Enter键或确认按钮确认绘制
- 鼠标工具，方便调整和选择元素
- 会议室自动清理机制，基于最后活动时间清理无人使用的会议室

## 技术栈

- 前端：Vue 3
- 后端：Node.js + Express
- WebSocket：实时通信
- 语音转写：讯飞星火 API

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/yourusername/whiteboard.git
cd whiteboard
```

### 2. 安装依赖

```bash
# 后端依赖
cd server
npm install

# 前端依赖
cd ../client
npm install
```

### 3. 配置 API 密钥

1. 复制 `server/config.example.js` 为 `server/config.js`
2. 填写讯飞星火 API 的密钥信息：

```javascript
// server/config.js
module.exports = {
  xfyun: {
    appId: 'YOUR_APP_ID',
    apiKey: 'YOUR_API_KEY',
    apiSecret: 'YOUR_API_SECRET',
    url: 'wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1'
  }
};
```

### 4. 启动服务

```bash
# 启动后端服务
cd server
npm start

# 启动前端服务
cd ../client
npm run dev
```

### 5. 访问应用

打开浏览器，访问 `http://localhost:5173`

## 语音转写功能

1. 点击「开始录音」按钮开始语音转写
2. 系统会实时显示转写结果作为字幕
3. 转写结果会被自动收集到转录历史中
4. 点击「打印发言内容」按钮可以查看所有转录历史
5. 点击「生成摘要」按钮可以基于白板内容和转录历史生成会议摘要

## 注意事项

- 确保您的麦克风权限已开启
- 确保您的网络连接稳定，以便与讯飞 API 进行通信
- 语音转写功能可能会产生少量冗余，但系统会自动进行去重处理

## 许可证

MIT
