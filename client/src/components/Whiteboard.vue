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
    </div>
    <div v-if="summary" class="summary-container">
      <h4>会议摘要:</h4>
      <div class="summary-content" v-html="summary"></div>
      <button @click="clearSummary">清空摘要</button>
    </div>
    <div v-if="transcription" class="transcription-container">
      <h4>语音转写:</h4>
      <p>{{ transcription }}</p>
      <button @click="addTranscriptionToCanvas">添加到白板</button>
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
      isRecording: false,
      transcription: '',
      mediaRecorder: null,
      audioChunks: [],
      drawingPoints: [],
      summary: '',
      transcriptionHistory: [],
      originalElements: null,
      showToast: false,
      toastMessage: '',
      toastType: 'info',
      strokeId: 0,
      currentStrokeId: null
    };
  },
  mounted() {
    this.canvas = this.$refs.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.setupCanvas();
    this.setupWebSocket();
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
        this.socket = new WebSocket('ws://localhost:3001');
        
        this.socket.onopen = () => {
          console.log('WebSocket connected');
        };
        
        this.socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'canvasState') {
              this.elements = data.data;
              this.redrawCanvas();
            } else if (data.type === 'draw') {
              this.elements.push(data.data);
              this.redrawCanvas();
            } else if (data.type === 'text') {
              this.elements.push(data.data);
              this.redrawCanvas();
            } else if (data.type === 'clear') {
              this.elements = [];
              this.ctx.clearRect(0, 0, this.width, this.height);
            }
          } catch (error) {
            console.error('Error processing WebSocket message:', error);
          }
        };
        
        this.socket.onclose = () => {
          console.log('WebSocket disconnected');
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
          // 对于美化后的圆形，直接使用边界框的宽度和高度来计算半径
          // 这样可以避免使用起点和终点计算半径的问题
          const radius = Math.max(
            Math.abs(element.lastX - element.startX),
            Math.abs(element.lastY - element.startY)
          ) / 2;
          // 圆心应该是边界框的中心
          const centerX = (element.startX + element.lastX) / 2;
          const centerY = (element.startY + element.lastY) / 2;
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
        this.socket.send(JSON.stringify({ type, data }));
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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(stream);
        this.audioChunks = [];
        
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };
        
        this.mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
          await this.sendAudioToServer(audioBlob);
        };
        
        this.mediaRecorder.start();
        this.isRecording = true;
        console.log('开始录音');
      } catch (error) {
        console.error('录音失败:', error);
      }
    },
    stopRecording() {
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
        this.isRecording = false;
        console.log('停止录音');
      }
    },
    async sendAudioToServer(audioBlob) {
      try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.wav');
        
        const response = await fetch('http://localhost:3001/api/speech', {
          method: 'POST',
          body: formData
        });
        
        const result = await response.json();
        if (result.success) {
          this.transcription = result.text;
        } else {
          console.error('转写失败:', result.error);
        }
      } catch (error) {
        console.error('发送音频失败:', error);
      }
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
        this.showToast('请先绘制一个图形', 'info');
        return;
      }
      
      try {
        // 保存原始元素，用于撤销美化
        this.originalElements = JSON.parse(JSON.stringify(this.elements));
        
        const response = await fetch('http://localhost:3001/api/recognize-shape', {
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
            // 清除最后一笔的画笔绘制内容
            // 只移除具有当前strokeId的pen元素
            if (this.currentStrokeId) {
              this.elements = this.elements.filter(element => !(element.type === 'pen' && element.strokeId === this.currentStrokeId));
            }
            
            // 添加美化后的图形
            const newElement = {
              ...beautifiedShape,
              color: this.color,
              lineWidth: this.lineWidth
            };
            this.elements.push(newElement);
            
            // 发送美化后的图形到服务器
            this.sendWebSocketMessage('draw', newElement);
            
            // 重新绘制画布
            this.redrawCanvas();
          } else {
            // 如果识别为pen类型，不进行美化，清除原始元素的保存
            this.originalElements = null;
            // 显示提示
            this.showToast('无法识别为规则图形，保持原始绘制', 'info');
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
        if (confirm('撤销美化会将画面恢复到上一次美化前的状态，美化后添加的内容会被清除。确定要继续吗？')) {
          // 恢复原始元素
          this.elements = this.originalElements;
          // 清空原始元素的保存
          this.originalElements = null;
          // 发送到服务器
          this.sendWebSocketMessage('clear', {});
          // 重新绘制画布
          this.redrawCanvas();
          // 重新发送所有元素到服务器
          this.elements.forEach(element => {
            if (element.type === 'text') {
              this.sendWebSocketMessage('text', element);
            } else {
              this.sendWebSocketMessage('draw', element);
            }
          });
        }
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
          this.showToast('白板内容为空，请先添加内容', 'info');
          return;
        }
        
        const response = await fetch('http://localhost:3001/api/generate-summary', {
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
    showToast(message, type = 'info') {
      this.toastMessage = message;
      this.toastType = type;
      this.showToast = true;
      
      // 3秒后自动隐藏
      setTimeout(() => {
        this.showToast = false;
      }, 3000);
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
</style>