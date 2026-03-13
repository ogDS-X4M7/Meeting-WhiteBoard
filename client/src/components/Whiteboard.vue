<template>
  <div class="whiteboard-container">
    <canvas
      ref="canvas"
      :width="width"
      :height="height"
      @mousedown="startDrawing"
      @mousemove="draw"
      @mouseup="stopDrawing"
      @mouseleave="stopDrawing"
    ></canvas>
    <div class="toolbar">
      <button @click="setTool('pen')" :class="{ active: currentTool === 'pen' }">画笔</button>
      <button @click="setTool('eraser')" :class="{ active: currentTool === 'eraser' }">橡皮</button>
      <button @click="setTool('text')" :class="{ active: currentTool === 'text' }">文本</button>
      <button @click="setTool('rectangle')" :class="{ active: currentTool === 'rectangle' }">矩形</button>
      <button @click="setTool('circle')" :class="{ active: currentTool === 'circle' }">圆形</button>
      <button @click="setTool('arrow')" :class="{ active: currentTool === 'arrow' }">箭头</button>
      <input type="color" v-model="color" />
      <input type="range" v-model="lineWidth" min="1" max="10" />
      <button @click="clearCanvas">清空</button>
      <button @click="exportCanvas">导出</button>
      <button @click="toggleSpeechRecognition" :class="{ active: isRecording }">
        {{ isRecording ? '停止录音' : '开始录音' }}
      </button>
      <button @click="beautifyShape">美化图形</button>
      <button @click="undoBeautify" :disabled="!originalElements">撤销美化</button>
      <button @click="generateSummary">生成摘要</button>
      <button @click="printTranscriptionHistory">打印发言内容</button>
    </div>
    <div v-if="summary" class="summary-container">
      <h4>会议摘要:</h4>
      <div class="summary-content" v-html="summary"></div>
      <button @click="clearSummary">清空摘要</button>
    </div>
    <!-- 字幕样式的转写结果展示 -->
    <div v-if="transcription" class="subtitle-container">
      <div class="subtitle">{{ transcription }}</div>
    </div>
    <div v-if="currentTool === 'text' && isAddingText" class="text-input-container">
      <input 
        ref="textInput" 
        v-model="textInput" 
        @blur="finishTextInput" 
        @keyup.enter="finishTextInput"
        placeholder="输入文本"
      />
    </div>
    <!-- 提示组件 -->
    <div v-if="showToast" class="toast" :class="toastType">
      {{ toastMessage }}
    </div>
  </div>
</template>

<script>
export default {
  name: 'Whiteboard',
  props: {
    roomCode: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      width: 800,
      height: 600,
      color: '#000000',
      lineWidth: 2,
      currentTool: 'pen',
      isDrawing: false,
      isAddingText: false,
      textInput: '',
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      canvas: null,
      ctx: null,
      elements: [],
      socket: null,
      socketId: null,
      isRecording: false,
      transcription: '',
      audioContext: null,
      processor: null,
      stream: null,
      drawingPoints: [],
      summary: '',
      transcriptionHistory: [],
      transcriptionBuffer: [], // 转录缓冲区，用于存储时间窗口内的结果
      bufferTimer: null, // 定期检查缓冲区的定时器
      originalElements: null,
      showToast: false,
      toastMessage: '',
      toastType: 'info',
      strokeId: 0,
      currentStrokeId: null,
      // 音频播放相关
      playbackAudioContext: null,
      audioDestination: null
    };
  },
  mounted() {
    this.canvas = this.$refs.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.setupCanvas();
    this.setupWebSocket();
  },
  beforeUnmount() {
    // 组件销毁时关闭 WebSocket 连接
    this.closeWebSocket();
  },
  methods: {
    setupCanvas() {
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = this.lineWidth;
    },
    setupWebSocket() {
      try {
        // 使用传入的roomCode建立WebSocket连接
        console.log(`Setting up WebSocket connection to room ${this.roomCode}`);
        this.socket = new WebSocket(`ws://192.168.118.168:8080?roomCode=${this.roomCode}`);
        
        this.socket.onopen = () => {
          console.log(`WebSocket connected to room ${this.roomCode}, readyState: ${this.socket.readyState}`);
        };
        
        this.socket.onmessage = (event) => {
          try {
            // 检查是否是二进制数据（音频数据）
            if (event.data instanceof ArrayBuffer) {
              console.log('Received audio data as ArrayBuffer, length:', event.data.byteLength);
              // 处理音频数据
              this.playAudioData(new Int16Array(event.data));
              return;
            } else if (event.data instanceof Blob) {
              console.log('Received audio data as Blob, size:', event.data.size);
              // 将 Blob 转换为 ArrayBuffer
              event.data.arrayBuffer().then(arrayBuffer => {
                console.log('Blob converted to ArrayBuffer, length:', arrayBuffer.byteLength);
                this.playAudioData(new Int16Array(arrayBuffer));
              }).catch(error => {
                console.error('Error converting Blob to ArrayBuffer:', error);
              });
              return;
            }
            
            console.log('Received WebSocket message:', event.data);
            const data = JSON.parse(event.data);
            if (data.type === 'canvasState') {
              console.log('Received canvasState message, elements length:', data.data.length);
              this.elements = data.data;
              this.redrawCanvas();
              console.log('Canvas redrawn after receiving canvasState');
            } else if (data.type === 'draw') {
              console.log('Received draw message:', data.data);
              this.elements.push(data.data);
              this.redrawCanvas();
            } else if (data.type === 'text') {
              console.log('Received text message:', data.data);
              this.elements.push(data.data);
              this.redrawCanvas();
            } else if (data.type === 'clear') {
              console.log('Received clear message');
              this.elements = [];
              this.ctx.clearRect(0, 0, this.width, this.height);
            } else if (data.type === 'beautify') {
              console.log('Received beautify message:', data.data);
              // 处理来自服务器的美化操作
              const { strokeId, newElement } = data.data;
              
              // 移除与当前绘制相关的所有pen元素（使用strokeId）
              if (strokeId) {
                this.elements = this.elements.filter(element => !(element.type === 'pen' && element.strokeId === strokeId));
              }
              
              // 添加美化后的元素
              this.elements.push(newElement);
              
              // 重新绘制画布
              this.redrawCanvas();
            } else if (data.type === 'socketId') {
              // 存储 socketId
              this.socketId = data.data;
              console.log('Received socketId:', this.socketId);
            } else if (data.type === 'error') {
              console.error('WebSocket error:', data.message);
              this.showToastMessage(data.message, 'error');
            } else if (data.type === 'transcriptionResult') {
              // 处理语音转写结果
              console.log('Received transcription result:', data.data || '无内容');
              this.transcription = data.data || '';
              console.log('当前转写内容:', this.transcription || '无内容');
              // 将转写结果添加到缓冲区
              if (this.transcription) {
                this.transcriptionBuffer.push({ text: this.transcription, timestamp: Date.now() });
                console.log('添加到转录缓冲区:', this.transcription);
              }
              
              // 延长字幕显示时间
              if (this.transcriptionTimer) {
                clearTimeout(this.transcriptionTimer);
              }
              this.transcriptionTimer = setTimeout(() => {
                this.transcription = '';
              }, 5000); // 5000ms = 5秒，比原来增加了1000ms
            } else if (data.type === 'transcriptionError') {
              // 处理语音转写错误
              console.error('Transcription error:', data.data);
              this.showToastMessage(data.data, 'error');
            }
          } catch (error) {
            console.error('Error processing WebSocket message:', error);
          }
        };
        
        this.socket.onclose = () => {
          console.log(`WebSocket disconnected from room ${this.roomCode}`);
        };
        
        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
        };
      } catch (error) {
        console.error('Failed to setup WebSocket:', error);
      }
    },
    setTool(tool) {
      this.currentTool = tool;
      this.isDrawing = false;
      this.isAddingText = false;
    },
    startDrawing(e) {
      const rect = this.canvas.getBoundingClientRect();
      this.startX = e.clientX - rect.left;
      this.startY = e.clientY - rect.top;
      this.lastX = this.startX;
      this.lastY = this.startY;
      
      // 清空绘制点数组，准备收集新图形的点
      this.drawingPoints = [{ x: this.startX, y: this.startY }];
      
      if (this.currentTool === 'text') {
        this.isAddingText = true;
        setTimeout(() => {
          this.$refs.textInput.focus();
        }, 100);
      } else {
        this.isDrawing = true;
        // 为每一笔分配一个唯一的strokeId
        this.strokeId++;
        this.currentStrokeId = this.strokeId;
      }
    },
    draw(e) {
      if (!this.isDrawing) return;
      
      const rect = this.canvas.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      
      // 实时更新结束坐标
      this.lastX = currentX;
      this.lastY = currentY;
      
      if (this.currentTool === 'pen') {
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.beginPath();
        this.ctx.moveTo(this.startX, this.startY);
        this.ctx.lineTo(currentX, currentY);
        this.ctx.stroke();
        
        // 保存画笔绘制的内容到elements数组
        const element = {
          type: 'pen',
          startX: this.startX,
          startY: this.startY,
          lastX: currentX,
          lastY: currentY,
          color: this.color,
          lineWidth: this.lineWidth,
          strokeId: this.currentStrokeId
        };
        this.elements.push(element);
        
        // 收集绘制点用于图形识别
        this.drawingPoints.push({ x: currentX, y: currentY });
        
        // 发送到服务器
        this.sendWebSocketMessage('draw', element);
        
        // 更新起点坐标，实现连续绘制
        this.startX = currentX;
        this.startY = currentY;
      } else if (this.currentTool === 'eraser') {
        // 橡皮功能：绘制白色线条覆盖原有内容
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = this.lineWidth * 2; // 橡皮宽度是线条的2倍
        this.ctx.beginPath();
        this.ctx.moveTo(this.startX, this.startY);
        this.ctx.lineTo(currentX, currentY);
        this.ctx.stroke();
        
        // 保存橡皮绘制的内容到elements数组
        const element = {
          type: 'eraser',
          startX: this.startX,
          startY: this.startY,
          lastX: currentX,
          lastY: currentY,
          lineWidth: this.lineWidth * 2
        };
        this.elements.push(element);
        
        // 发送到服务器
        this.sendWebSocketMessage('draw', element);
        
        // 更新起点坐标，实现连续擦除
        this.startX = currentX;
        this.startY = currentY;
      } else if (this.currentTool === 'rectangle' || this.currentTool === 'circle' || this.currentTool === 'arrow') {
        // 清空画布并重新绘制所有元素
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.redrawElements();
        
        // 绘制当前图形
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.lineWidth;
        
        if (this.currentTool === 'rectangle') {
          this.ctx.beginPath();
          this.ctx.rect(
            Math.min(this.startX, currentX),
            Math.min(this.startY, currentY),
            Math.abs(currentX - this.startX),
            Math.abs(currentY - this.startY)
          );
          this.ctx.stroke();
        } else if (this.currentTool === 'circle') {
          const radius = Math.sqrt(
            Math.pow(currentX - this.startX, 2) + Math.pow(currentY - this.startY, 2)
          );
          this.ctx.beginPath();
          this.ctx.arc(this.startX, this.startY, radius, 0, Math.PI * 2);
          this.ctx.stroke();
        } else if (this.currentTool === 'arrow') {
          this.ctx.beginPath();
          this.ctx.moveTo(this.startX, this.startY);
          this.ctx.lineTo(currentX, currentY);
          this.ctx.stroke();
          // 绘制箭头
          const angle = Math.atan2(currentY - this.startY, currentX - this.startX);
          const arrowLength = 10;
          this.ctx.beginPath();
          this.ctx.moveTo(currentX, currentY);
          this.ctx.lineTo(
            currentX - arrowLength * Math.cos(angle - Math.PI / 6),
            currentY - arrowLength * Math.sin(angle - Math.PI / 6)
          );
          this.ctx.moveTo(currentX, currentY);
          this.ctx.lineTo(
            currentX - arrowLength * Math.cos(angle + Math.PI / 6),
            currentY - arrowLength * Math.sin(angle + Math.PI / 6)
          );
          this.ctx.stroke();
        }
      }
    },
    stopDrawing() {
      if (this.isDrawing) {
        if (this.currentTool === 'pen') {
          // 画笔已经在draw方法中逐段保存，不需要额外处理
        } else if (this.currentTool === 'rectangle' || this.currentTool === 'circle' || this.currentTool === 'arrow') {
          // 保存图形元素
          const element = {
            type: this.currentTool,
            startX: this.startX,
            startY: this.startY,
            lastX: this.lastX,
            lastY: this.lastY,
            color: this.color,
            lineWidth: this.lineWidth
          };
          this.elements.push(element);
          // 发送到服务器
          this.sendWebSocketMessage('draw', element);
          // 重新绘制所有元素
          this.ctx.clearRect(0, 0, this.width, this.height);
          this.redrawElements();
        } else if (this.currentTool === 'eraser') {
          // 发送橡皮操作的更新
          console.log('Sending canvas state after erasing, elements length:', this.elements.length);
          // 发送完整的画布状态到服务器
          this.sendWebSocketMessage('canvasState', this.elements);
          // 重新绘制本地画布，确保本地画面与发送到服务器的状态一致
          this.ctx.clearRect(0, 0, this.width, this.height);
          this.redrawElements();
          console.log('Local canvas redrawn after erasing');
        }
        this.isDrawing = false;
      }
    },
    redrawCanvas() {
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.redrawElements();
    },
    redrawElements() {
      this.elements.forEach(element => {
        if (element.type === 'eraser') {
          this.ctx.strokeStyle = '#ffffff';
          this.ctx.lineWidth = element.lineWidth;
          this.ctx.beginPath();
          this.ctx.moveTo(element.startX, element.startY);
          this.ctx.lineTo(element.lastX, element.lastY);
          this.ctx.stroke();
        } else {
          this.ctx.strokeStyle = element.color;
          this.ctx.lineWidth = element.lineWidth;
          
          if (element.type === 'pen') {
            this.ctx.beginPath();
            this.ctx.moveTo(element.startX, element.startY);
            this.ctx.lineTo(element.lastX, element.lastY);
            this.ctx.stroke();
          } else if (element.type === 'rectangle') {
            this.ctx.beginPath();
            this.ctx.rect(
              Math.min(element.startX, element.lastX),
              Math.min(element.startY, element.lastY),
              Math.abs(element.lastX - element.startX),
              Math.abs(element.lastY - element.startY)
            );
            this.ctx.stroke();
          } else if (element.type === 'circle') {
            // 区分用户绘制的圆形和美化后的圆形
            // 用户绘制的圆形：startX, startY 是圆心，lastX, lastY 是圆周上的点
            // 美化后的圆形：startX, startY 是左上角，lastX, lastY 是右下角
            
            let centerX, centerY, radius;
            
            // 检查是否是美化后的圆形（美化后的圆形通常是边界框形式）
            if (element.center) {
              // 美化后的圆形，有center属性
              centerX = element.center.x;
              centerY = element.center.y;
              radius = element.radius;
            } else if (Math.abs(element.lastX - element.startX) === Math.abs(element.lastY - element.startY)) {
              // 美化后的圆形，没有center属性但宽度和高度相等
              centerX = (element.startX + element.lastX) / 2;
              centerY = (element.startY + element.lastY) / 2;
              radius = (element.lastX - element.startX) / 2;
            } else {
              // 用户绘制的圆形
              centerX = element.startX;
              centerY = element.startY;
              radius = Math.sqrt(
                Math.pow(element.lastX - element.startX, 2) + Math.pow(element.lastY - element.startY, 2)
              );
            }
            
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            this.ctx.stroke();
          } else if (element.type === 'arrow') {
            this.ctx.beginPath();
            this.ctx.moveTo(element.startX, element.startY);
            this.ctx.lineTo(element.lastX, element.lastY);
            this.ctx.stroke();
            // 绘制箭头
            const angle = Math.atan2(element.lastY - element.startY, element.lastX - element.startX);
            const arrowLength = 10;
            this.ctx.beginPath();
            this.ctx.moveTo(element.lastX, element.lastY);
            this.ctx.lineTo(
              element.lastX - arrowLength * Math.cos(angle - Math.PI / 6),
              element.lastY - arrowLength * Math.sin(angle - Math.PI / 6)
            );
            this.ctx.moveTo(element.lastX, element.lastY);
            this.ctx.lineTo(
              element.lastX - arrowLength * Math.cos(angle + Math.PI / 6),
              element.lastY - arrowLength * Math.sin(angle + Math.PI / 6)
            );
            this.ctx.stroke();
          } else if (element.type === 'text') {
            this.ctx.fillStyle = element.color;
            this.ctx.font = `${element.lineWidth * 2}px Arial`;
            this.ctx.fillText(element.text, element.x, element.y);
          }
        }
      });
    },
    finishTextInput() {
      if (this.textInput) {
        this.ctx.fillStyle = this.color;
        this.ctx.font = `${this.lineWidth * 2}px Arial`;
        this.ctx.fillText(this.textInput, this.startX, this.startY);
        // 保存文本到elements数组
        const element = {
          type: 'text',
          x: this.startX,
          y: this.startY,
          text: this.textInput,
          color: this.color,
          lineWidth: this.lineWidth
        };
        this.elements.push(element);
        // 发送到服务器
        this.sendWebSocketMessage('text', element);
        
        // 添加到转录历史
        this.transcriptionHistory.push(this.textInput);
      }
      this.isAddingText = false;
      this.textInput = '';
    },
    clearCanvas() {
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.elements = [];
      // 发送到服务器
      this.sendWebSocketMessage('clear', {});
    },
    exportCanvas() {
      const dataURL = this.canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = 'whiteboard.png';
      link.click();
    },
    sendWebSocketMessage(type, data) {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        console.log(`Sending WebSocket message: ${type}, data length: ${JSON.stringify(data).length}`);
        this.socket.send(JSON.stringify({ type, data }));
      } else {
        console.error('WebSocket not open, readyState:', this.socket ? this.socket.readyState : 'null');
      }
    },
    async toggleSpeechRecognition() {
      if (this.isRecording) {
        this.stopRecording();
      } else {
        await this.startRecording();
      }
    },
    async startRecording() {
      try {
        // 请求16kHz采样率的音频流
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            sampleSize: 16
          }
        });
        
        // 创建音频上下文，设置采样率为16kHz
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000
        });
        const source = audioContext.createMediaStreamSource(stream);
        
        // 创建脚本处理器，用于获取音频数据
        // 16kHz采样率，缓冲区大小设置为1024（最接近640的2的幂）
        const processor = audioContext.createScriptProcessor(1024, 1, 1);
        
        // 发送开始转写的消息
        this.sendWebSocketMessage('startTranscription', {});
        
        // 音频数据缓冲区
        let audioBuffer = [];
        
        // 处理音频数据
        processor.onaudioprocess = (event) => {
          if (this.isRecording) {
            const inputData = event.inputBuffer.getChannelData(0);
            // 转换为16位PCM格式
            const pcmData = this.float32ToInt16(inputData);
            // 将音频数据添加到缓冲区
            audioBuffer.push(pcmData);
          }
        };
        
        // 每400ms发送一次音频数据
        const sendInterval = setInterval(() => {
          if (this.isRecording && audioBuffer.length > 0 && this.socket && this.socket.readyState === WebSocket.OPEN) {
            // 合并缓冲区中的音频数据
            const mergedData = new Int16Array(audioBuffer.reduce((total, buffer) => total + buffer.length, 0));
            let offset = 0;
            audioBuffer.forEach(buffer => {
              mergedData.set(buffer, offset);
              offset += buffer.length;
            });
            
            // 发送音频数据到服务器
            this.socket.send(mergedData.buffer);
            
            // 清空缓冲区
            audioBuffer = [];
          }
        }, 400);
        
        // 保存定时器ID，用于停止录音时清除
        this.sendInterval = sendInterval;
        
        // 连接音频节点
        source.connect(processor);
        processor.connect(audioContext.destination);
        
        this.isRecording = true;
        this.audioContext = audioContext;
        this.processor = processor;
        this.stream = stream;
        
        // 启动缓冲区处理定时器，每3秒检查一次
        this.bufferTimer = setInterval(() => {
          this.mergeTranscriptionResults();
        }, 3000);
        
        console.log('开始录音');
        console.log('启动转录缓冲区处理定时器');
        
      } catch (error) {
        console.error('录音失败:', error);
        this.showToastMessage('录音失败，请检查麦克风权限', 'error');
      }
    },
    stopRecording() {
      if (this.isRecording) {
        // 发送停止转写的消息
        this.sendWebSocketMessage('stopTranscription', {});
        
        // 清除发送定时器
        if (this.sendInterval) {
          clearInterval(this.sendInterval);
          this.sendInterval = null;
        }
        
        // 关闭音频处理
        if (this.processor) {
          this.processor.disconnect();
          this.processor = null;
        }
        
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
        }
        
        if (this.audioContext) {
          this.audioContext.close();
          this.audioContext = null;
        }
        
        this.isRecording = false;
        
        // 清除缓冲区处理定时器
        if (this.bufferTimer) {
          clearInterval(this.bufferTimer);
          this.bufferTimer = null;
          console.log('停止转录缓冲区处理定时器');
        }
        
        // 最后一次合并转录结果
        this.mergeTranscriptionResults();
        
        console.log('停止录音');
        
      }
    },
    // 将float32格式的音频数据转换为int16格式
    float32ToInt16(buffer) {
      const length = buffer.length;
      const result = new Int16Array(length);
      for (let i = 0; i < length; i++) {
        const s = Math.max(-1, Math.min(1, buffer[i]));
        result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return result;
    },
    addTranscriptionToCanvas() {
      if (this.transcription) {
        const element = {
          type: 'text',
          x: 50,
          y: 50,
          text: this.transcription,
          color: this.color,
          lineWidth: this.lineWidth
        };
        this.elements.push(element);
        this.sendWebSocketMessage('text', element);
        this.redrawCanvas();
        
        // 添加到转录历史
        this.transcriptionHistory.push(this.transcription);
      }
    },
    async beautifyShape() {
      if (this.drawingPoints.length < 3) {
        this.showToastMessage('请先绘制一个图形', 'info');
        return;
      }
      
      try {
        // 保存原始元素，用于撤销美化
        this.originalElements = JSON.parse(JSON.stringify(this.elements));
        
        const response = await fetch('http://192.168.118.168:8080/api/recognize-shape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ points: this.drawingPoints })
        });
        
        const result = await response.json();
        if (result.success) {
          const beautifiedShape = result.shape;
          
          // 只有当识别成功且不是pen类型时才进行美化
          if (beautifiedShape.type !== 'pen') {
            // 移除与当前绘制相关的所有pen元素（使用strokeId）
            const elementsBefore = this.elements.length;
            if (this.currentStrokeId) {
              this.elements = this.elements.filter(element => !(element.type === 'pen' && element.strokeId === this.currentStrokeId));
            }
            console.log(`移除了 ${elementsBefore - this.elements.length} 个pen元素`);
            
            // 添加美化后的图形
            const newElement = {
              ...beautifiedShape,
              color: this.color,
              lineWidth: this.lineWidth
            };
            this.elements.push(newElement);
            
            // 发送美化消息到服务器，包含strokeId和新的美化元素
            console.log('发送美化消息:', {
              strokeId: this.currentStrokeId,
              newElement: newElement
            });
            this.sendWebSocketMessage('beautify', {
              strokeId: this.currentStrokeId,
              newElement: newElement
            });
            
            // 重新绘制画布
            this.redrawCanvas();
          } else {
            // 如果识别为pen类型，不进行美化，清除原始元素的保存
            this.originalElements = null;
            // 显示提示
            this.showToastMessage('无法识别为规则图形，保持原始绘制', 'info');
          }
        } else {
          console.error('图形美化失败:', result.error);
          // 如果美化失败，清除原始元素的保存
          this.originalElements = null;
        }
      } catch (error) {
        console.error('发送图形数据失败:', error);
        // 如果发生错误，清除原始元素的保存
        this.originalElements = null;
      }
    },
    undoBeautify() {
      if (this.originalElements) {
        // 显示确认弹窗
        const userConfirmed = confirm('撤销美化会将画面恢复到上一次美化前的状态，美化后添加的内容会被清除。确定要继续吗？');
        console.log('用户确认状态:', userConfirmed);
        if (userConfirmed) {
          // 恢复原始元素
          this.elements = this.originalElements;
          // 清空原始元素的保存
          this.originalElements = null;
          // 重新绘制画布
          this.redrawCanvas();
          // 发送完整的画布状态到服务器
          this.sendWebSocketMessage('canvasState', this.elements);
          console.log('已执行撤销美化操作');
        } else {
          console.log('用户取消了撤销美化操作');
        }
      } else {
        console.log('没有可撤销的美化操作');
      }
    },
    async generateSummary() {
      try {
        // 提取白板内容
        const whiteboardContent = this.elements.map(element => {
          if (element.type === 'text') {
            return `文本: ${element.text}`;
          } else if (element.type === 'rectangle') {
            return '矩形图形';
          } else if (element.type === 'circle') {
            return '圆形图形';
          } else if (element.type === 'arrow') {
            return '箭头图形';
          } else if (element.type === 'pen') {
            return '手绘图形';
          }
          return '';
        }).filter(Boolean).join('\n');
        
        if (!whiteboardContent) {
          this.showToastMessage('白板内容为空，请先添加内容', 'info');
          return;
        }
        
        const response = await fetch('http://192.168.118.168:8080/api/generate-summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            whiteboardContent,
            transcriptionHistory: this.transcriptionHistory.join('\n')
          })
        });
        
        const result = await response.json();
        if (result.success) {
          this.summary = result.summary;
        } else {
          console.error('生成摘要失败:', result.error);
        }
      } catch (error) {
        console.error('发送数据失败:', error);
      }
    },
    clearSummary() {
      this.summary = '';
    },
    // 打印所有发言内容
    printTranscriptionHistory() {
      console.log('所有发言内容:');
      if (this.transcriptionHistory.length > 0) {
        this.transcriptionHistory.forEach((content, index) => {
          console.log(`${index + 1}. ${content}`);
        });
      } else {
        console.log('暂无发言内容');
      }
    },
    showToastMessage(message, type = 'info') {
      this.toastMessage = message;
      this.toastType = type;
      this.showToast = true;
      
      // 3秒后自动隐藏
      setTimeout(() => {
        this.showToast = false;
      }, 3000);
    },
    closeWebSocket() {
      console.log('closeWebSocket called, socket:', this.socket);
      if (this.socket) {
        console.log('WebSocket readyState:', this.socket.readyState);
        // 不管连接处于什么状态，都尝试关闭它
        try {
          this.socket.close(1000, 'User left meeting');
          console.log('WebSocket connection closed');
        } catch (error) {
          console.error('Error closing WebSocket connection:', error);
        }
      } else {
        console.log('No socket to close');
      }
    },
    // 合并缓冲区中的转录结果
    mergeTranscriptionResults() {
      if (this.transcriptionBuffer.length === 0) return;
      
      // 按时间排序
      this.transcriptionBuffer.sort((a, b) => a.timestamp - b.timestamp);
      
      // 提取所有非空文本
      const texts = this.transcriptionBuffer.map(item => item.text).filter(text => text.trim() !== '');
      
      if (texts.length === 0) {
        // 清空缓冲区
        this.transcriptionBuffer = [];
        return;
      }
      
      // 去除前缀重复的内容，只保留最长的版本
      const uniqueTexts = this.removePrefixDuplicates(texts);
      
      // 将去重后的结果添加到历史记录
      uniqueTexts.forEach(text => {
        // 检查是否与历史记录最后一条完全重复
        if (this.transcriptionHistory.length === 0) {
          // 如果历史记录为空，直接添加
          this.transcriptionHistory.push(text);
          console.log('添加到转录历史:', text);
        } else {
          const lastText = this.transcriptionHistory[this.transcriptionHistory.length - 1];
          
          // 检查当前文本是否是历史记录最后一条的前缀
          if (this.isPrefixWithPunctuation(text, lastText)) {
            // 如果是前缀，不添加
            console.log('当前文本是历史记录最后一条的前缀，不添加:', text);
          } 
          // 检查历史记录最后一条是否是当前文本的前缀
          else if (this.isPrefixWithPunctuation(lastText, text)) {
            // 如果是前缀，替换历史记录最后一条
            this.transcriptionHistory[this.transcriptionHistory.length - 1] = text;
            console.log('替换历史记录最后一条:', text);
          } 
          // 如果不是前缀关系，且不完全重复，添加到历史记录
          else if (lastText !== text) {
            this.transcriptionHistory.push(text);
            console.log('添加到转录历史:', text);
          }
        }
      });
      
      // 清空缓冲区
      this.transcriptionBuffer = [];
    },
    
    // 去除前缀重复的内容，只保留最长的版本
    removePrefixDuplicates(texts) {
      if (texts.length <= 1) return texts;
      
      // 按长度降序排序
      texts.sort((a, b) => b.length - a.length);
      
      const uniqueTexts = [];
      
      for (let i = 0; i < texts.length; i++) {
        const currentText = texts[i];
        let isPrefix = false;
        
        // 检查是否是已添加文本的前缀（忽略开头的标点符号）
        for (let j = 0; j < uniqueTexts.length; j++) {
          if (this.isPrefixWithPunctuation(currentText, uniqueTexts[j])) {
            isPrefix = true;
            break;
          }
        }
        
        if (!isPrefix) {
          uniqueTexts.push(currentText);
        }
      }
      
      return uniqueTexts;
    },
    
    // 检查text1是否是text2的前缀（忽略所有标点符号）
    isPrefixWithPunctuation(text1, text2) {
      // 去除所有标点符号和空白字符
      const cleanText1 = text1.replace(/[\p{P}\s]+/gu, '');
      const cleanText2 = text2.replace(/[\p{P}\s]+/gu, '');
      
      // 检查cleanText1是否是cleanText2的前缀
      return cleanText2.startsWith(cleanText1);
    },
    
    // 初始化音频播放上下文
    initAudioPlayback() {
      if (!this.playbackAudioContext) {
        this.playbackAudioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000
        });
        this.audioDestination = this.playbackAudioContext.destination;
        console.log('Audio playback initialized');
      }
    },
    
    // 播放音频数据
    playAudioData(audioData) {
      try {
        console.log('Received audio data for playback, length:', audioData.length);
        console.log('Audio data sample values:', audioData.slice(0, 10));
        
        this.initAudioPlayback();
        
        // 创建音频缓冲区
        const buffer = this.playbackAudioContext.createBuffer(1, audioData.length, 16000);
        const channelData = buffer.getChannelData(0);
        
        // 将 Int16Array 转换为 Float32Array
        for (let i = 0; i < audioData.length; i++) {
          channelData[i] = audioData[i] / 32768; // 转换为 [-1, 1] 范围
        }
        
        // 创建音频源并播放
        const source = this.playbackAudioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioDestination);
        source.start();
        console.log('Audio data played successfully');
      } catch (error) {
        console.error('Error playing audio data:', error);
      }
    },
    // 节流函数
    throttle(func, delay) {
      let lastCall = 0;
      return function(...args) {
        const now = new Date().getTime();
        if (now - lastCall < delay) {
          return;
        }
        lastCall = now;
        return func.apply(this, args);
      };
    },
    // 发送橡皮操作的更新
    sendEraserUpdate() {
      // 发送清除消息到服务器
      this.sendWebSocketMessage('clear', {});
      // 重新发送所有剩余元素到服务器
      this.elements.forEach(element => {
        if (element.type === 'text') {
          this.sendWebSocketMessage('text', element);
        } else {
          this.sendWebSocketMessage('draw', element);
        }
      });
    },
    // 检测两条线段是否相交
    doLinesIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
      const det = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
      if (det === 0) {
        return false;
      }
      const lambda = ((y4 - y3) * (x4 - x1) + (x3 - x4) * (y4 - y1)) / det;
      const gamma = ((y1 - y2) * (x4 - x1) + (x2 - x1) * (y4 - y1)) / det;
      return (lambda > 0 && lambda < 1 && gamma > 0 && gamma < 1);
    },
    // 检测点是否在矩形内
    isPointInRect(x, y, rectX, rectY, rectWidth, rectHeight) {
      return x >= rectX && x <= rectX + rectWidth && y >= rectY && y <= rectY + rectHeight;
    }
  }
};
</script>

<style scoped>
.whiteboard-container {
  position: relative;
  width: 800px;
  height: 600px;
  border: 1px solid #ccc;
  margin: 0 auto;
}

canvas {
  background-color: white;
  cursor: crosshair;
}

.toolbar {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  gap: 10px;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 10px;
  border-radius: 5px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  flex-wrap: wrap;
}

button {
  padding: 5px 10px;
  border: none;
  background-color: #007bff;
  color: white;
  border-radius: 3px;
  cursor: pointer;
  font-size: 14px;
}

button:hover {
  background-color: #0069d9;
}

button.active {
  background-color: #0056b3;
  font-weight: bold;
}

input[type="color"] {
  width: 40px;
  height: 30px;
  border: none;
  cursor: pointer;
}

input[type="range"] {
  width: 100px;
}

.text-input-container {
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: white;
  padding: 5px;
  border: 1px solid #ccc;
  border-radius: 3px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.text-input-container input {
  border: none;
  outline: none;
  font-size: 14px;
  padding: 5px;
  width: 200px;
}

.transcription-container {
  position: absolute;
  bottom: 10px;
  left: 10px;
  background-color: rgba(255, 255, 255, 0.9);
  padding: 10px;
  border-radius: 5px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  max-width: 300px;
}

.transcription-container h4 {
  margin: 0 0 5px 0;
  font-size: 14px;
  color: #333;
}

.transcription-container p {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #666;
  word-wrap: break-word;
}

.transcription-container button {
  font-size: 12px;
  padding: 3px 8px;
}

.summary-container {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background-color: rgba(255, 255, 255, 0.9);
  padding: 10px;
  border-radius: 5px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  max-width: 300px;
  max-height: 300px;
  overflow-y: auto;
}

.summary-container h4 {
  margin: 0 0 5px 0;
  font-size: 14px;
  color: #333;
}

.summary-content {
  font-size: 12px;
  line-height: 1.4;
  color: #666;
  margin-bottom: 10px;
}

.summary-content h1, .summary-content h2, .summary-content h3, .summary-content h4 {
  margin: 10px 0 5px 0;
  font-size: 14px;
  color: #333;
}

.summary-content ul, .summary-content ol {
  margin: 5px 0;
  padding-left: 20px;
}

.summary-container button {
  font-size: 12px;
  padding: 3px 8px;
}

/* 提示组件样式 */
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 12px 20px;
  border-radius: 4px;
  color: white;
  font-size: 14px;
  z-index: 1000;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  animation: slideIn 0.3s ease-out;
}

.toast.info {
  background-color: #409eff;
}

.toast.success {
  background-color: #67c23a;
}

.toast.warning {
  background-color: #e6a23c;
}

.toast.error {
  background-color: #f56c6c;
}

/* 字幕样式 */
.subtitle-container {
  position: fixed;
  bottom: 100px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  z-index: 999;
}

.subtitle {
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 16px;
  max-width: 80%;
  text-align: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  animation: fadeIn 0.5s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>