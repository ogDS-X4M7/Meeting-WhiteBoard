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
      <button @click="setTool('mouse')" :class="{ active: currentTool === 'mouse' }">鼠标</button>
      <button @click="setTool('rectangle')" :class="{ active: currentTool === 'rectangle' }">矩形</button>
      <button @click="setTool('circle')" :class="{ active: currentTool === 'circle' }">圆形</button>
      <button @click="setTool('diamond')" :class="{ active: currentTool === 'diamond' }">菱形</button>
      <button @click="setTool('arrow')" :class="{ active: currentTool === 'arrow' }">箭头</button>
      <input type="color" v-model="color" />
      <span>笔画粗细:</span>
      <input type="range" v-model="lineWidth" min="1" max="10" />
      <span>{{ lineWidth }}px</span>
      <span>字体大小:</span>
      <input type="range" v-model="fontSize" min="8" max="48" />
      <span>{{ fontSize }}px</span>
      <button @click="clearCanvas">清空</button>
      <button @click="exportCanvas">导出</button>
      <button @click="toggleSpeechRecognition" :class="{ active: isRecording }">
        {{ isRecording ? '停止录音' : '开始录音' }}
      </button>
      <button @click="beautifyShape">美化图形</button>
      <button @click="undoBeautify" :disabled="!originalElements">撤销美化</button>
      <button @click="generateSummary">生成摘要</button>
      <button @click="printTranscriptionHistory">打印发言内容</button>
      <div class="nickname-container">
        <span v-if="!showNicknameInput">{{ nickname }} <button @click="showNicknameInput = true">修改</button></span>
        <div v-else class="nickname-input">
          <input v-model="nickname" @keyup.enter="saveNickname" @blur="saveNickname" placeholder="输入昵称" />
          <button @click="saveNickname">保存</button>
          <button @click="showNicknameInput = false">取消</button>
        </div>
      </div>
    </div>
    <div v-if="summary" class="summary-container">
      <h4>会议摘要:</h4>
      <div class="summary-content" v-html="summary"></div>
      <button @click="clearSummary">清空摘要</button>
    </div>
    <!-- 多用户字幕样式的转写结果展示 -->
    <div class="multi-subtitle-container">
      <div v-for="(transcription, speaker) in userTranscriptions" :key="speaker" class="subtitle-container">
        <div class="subtitle">
          <span class="speaker-name">{{ speaker }}:</span> {{ transcription }}
        </div>
      </div>
    </div>
    <div v-if="currentTool === 'text' && isAddingText" class="text-input-wrapper" :style="{ left: textbox.x + 'px', top: textbox.y + 'px' }">
      <div class="text-input-container" :style="{ width: textbox.width + 'px', height: textbox.height + 'px' }">
        <textarea 
          ref="textInput" 
          v-model="textbox.content" 
          @input="updateTextPreview"
          @keyup.enter="finishTextInput"
          @blur="handleTextareaBlur"
          placeholder="输入文本，按Enter键或点击确认按钮绘制"
          :style="{ fontSize: textbox.fontSize + 'px' }"
          rows="4"
        />
      </div>
      <div class="text-input-button" style="pointer-events: auto;">
        <button @click.stop="finishTextInput">确认</button>
      </div>
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
      // 白板属性
      width: 800,
      height: 600,
      // 画笔属性
      color: '#000000',
      lineWidth: 2,
      currentTool: 'pen',
      // 状态属性
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
      processor: null, // 音频处理器
      stream: null, // 音频流
      drawingPoints: [], // 收集当前绘制点
      summary: '', // 摘要
      transcriptionHistory: [],
      transcriptionBuffer: [], // 转录缓冲区，用于存储时间窗口内的结果
      bufferTimer: null, // 定期检查缓冲区的定时器
      originalElements: null, // 原始元素，用于撤销美化
      showToast: false,
      toastMessage: '',
      toastType: 'info',
      strokeId: 0, // 绘制的笔画id
      currentStrokeId: null,
      // 音频播放相关
      playbackAudioContext: null,
      audioDestination: null,
      // 参会人员昵称
      nickname: localStorage.getItem('nickname') || `用户${Math.floor(Math.random() * 1000)}`,
      showNicknameInput: false,
      // 转写发言人
      transcriptionSpeaker: '',
      // 多用户字幕显示
      userTranscriptions: {}, // 存储每个用户的转录结果
      transcriptionTimers: {}, // 存储每个用户的字幕显示定时器
      // 文本框相关
      isAddingText: false,
      textbox: {
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        content: '',
        fontSize: 16,
        isResizing: false,
        isDragging: false,
        resizeHandle: null,
        dragOffsetX: 0,
        dragOffsetY: 0
      },
      // 文本字体大小
      fontSize: 16
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
        console.log(`与会议室${this.roomCode}建立WebSocket连接`);
        this.socket = new WebSocket(`ws://192.168.248.168:8080?roomCode=${this.roomCode}`);
        
        this.socket.onopen = () => {
          console.log(`与会议室${this.roomCode}的WebSocket连接成功，readyState: ${this.socket.readyState}`);
          // 发送昵称信息到服务器
          this.sendWebSocketMessage('updateNickname', { nickname: this.nickname });
        };
        
        this.socket.onmessage = (event) => {
          try {
            // 检查是否是二进制数据（音频数据）
            if (event.data instanceof ArrayBuffer) {
              console.log(`收到音频数据，长度: ${event.data.byteLength}`);
              // 处理音频数据
              this.playAudioData(new Int16Array(event.data));
              return;
            } else if (event.data instanceof Blob) {
              console.log(`收到音频数据，大小: ${event.data.size}`);
              // 将 Blob 转换为 ArrayBuffer
              event.data.arrayBuffer().then(arrayBuffer => {
                console.log(`Blob转换为ArrayBuffer，长度: ${arrayBuffer.byteLength}`);
                this.playAudioData(new Int16Array(arrayBuffer));
              }).catch(error => {
                console.error(`Blob转换为ArrayBuffer失败:`, error);
              });
              return;
            }
            
            console.log(`收到WebSocket消息: ${event.data}`);
            const data = JSON.parse(event.data);
            if (data.type === 'canvasState') {
              console.log(`收到canvasState消息，元素数量: ${data.data.length}`);
              this.elements = data.data;
              this.redrawCanvas();
              console.log(`canvasState消息已处理`);
            } else if (data.type === 'draw') {
              console.log(`收到draw消息: ${data.data}`);
              this.elements.push(data.data);
              this.redrawCanvas();
            } else if (data.type === 'text') {
              console.log(`收到text消息: ${data.data}`);
              this.elements.push(data.data);
              this.redrawCanvas();
            } else if (data.type === 'clear') {
              console.log(`收到clear消息`);
              this.elements = [];
              this.ctx.clearRect(0, 0, this.width, this.height);
            } else if (data.type === 'beautify') {
              console.log(`收到beautify消息: ${data.data}`);
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
              console.log(`收到socketId: ${this.socketId}`);
            } else if (data.type === 'error') {
              console.error(`WebSocket错误: ${data.message}`);
              this.showToastMessage(data.message, 'error');
            } else if (data.type === 'transcriptionResult') {
              // 处理语音转写结果
              console.log(`收到语音转写结果: ${data.data || '无内容'} from ${data.speaker || '未知'}`);
              const speaker = data.speaker || '未知';
              const transcription = data.data || '';
              console.log(`当前转写内容: ${transcription || '无内容'} 发言人: ${speaker}`);
              
              // 将转写结果添加到缓冲区
              if (transcription) {
                this.transcriptionBuffer.push({ text: transcription, speaker: speaker, timestamp: Date.now() });
                console.log('添加到转录缓冲区:', transcription, '发言人:', speaker);
              }
              
              // 更新用户转录结果
              if (transcription) {
                this.userTranscriptions[speaker] = transcription;
                
                // 清除之前的定时器
                if (this.transcriptionTimers[speaker]) {
                  clearTimeout(this.transcriptionTimers[speaker]);
                }
                
                // 设置新的定时器，5秒后清除该用户的字幕
                this.transcriptionTimers[speaker] = setTimeout(() => {
                  delete this.userTranscriptions[speaker];
                  delete this.transcriptionTimers[speaker];
                }, 5000); // 5000ms = 5秒
              }
            } else if (data.type === 'nicknameUpdated') {
              // 昵称更新确认
              console.log(`昵称已更新为: ${data.data}`);
              this.showToastMessage(`昵称已更新为: ${data.data}`, 'success');
            } else if (data.type === 'transcriptionError') {
              // 处理语音转写错误
              console.error(`语音转写错误: ${data.data}`);
              this.showToastMessage(`语音转写错误: ${data.data}`, 'error');
            } else if (data.type === 'undoBeautify') {
              // 处理撤销美化操作
              console.log(`收到undoBeautify消息: ${data.data}`);
              // 撤销美化操作，移除美化后的元素，恢复原始状态
              // 由于我们没有保存原始状态，这里需要重新获取画布状态
              // 服务器会广播canvasState消息，所以这里不需要做任何操作
              // 只需要等待canvasState消息即可
              console.log(`收到undoBeautify消息，等待canvasState更新`);
            }
          } catch (error) {
            console.error(`处理WebSocket消息时出错: ${error}`);
          }
        };
        
        this.socket.onclose = () => {
          console.log(`WebSocket 已断开连接，会议室: ${this.roomCode}`);
        };
        
        this.socket.onerror = (error) => {
          console.error(`WebSocket 错误: ${error}`);
        };
      } catch (error) {
        console.error(`设置WebSocket连接时出错: ${error}`);
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
      
      if (this.currentTool === 'text' || this.currentTool === 'mouse') {
        // 检查是否点击了调整手柄
        const resizeHandleSize = 8;
        const handleX = this.textbox.x + this.textbox.width - resizeHandleSize / 2;
        const handleY = this.textbox.y + this.textbox.height - resizeHandleSize / 2;
        
        if (this.isAddingText && 
            this.startX >= handleX && 
            this.startX <= handleX + resizeHandleSize && 
            this.startY >= handleY && 
            this.startY <= handleY + resizeHandleSize) {
          // 开始调整文本框大小
          this.textbox.isResizing = true;
          this.textbox.isDragging = false;
          this.textbox.resizeHandle = 'bottomRight';
        } else if (this.isAddingText && 
                   this.startX >= this.textbox.x && 
                   this.startX <= this.textbox.x + this.textbox.width && 
                   this.startY >= this.textbox.y && 
                   this.startY <= this.textbox.y + this.textbox.height) {
          // 开始拖动文本框
          this.textbox.isDragging = true;
          this.textbox.isResizing = false;
          this.textbox.dragOffsetX = this.startX - this.textbox.x;
          this.textbox.dragOffsetY = this.startY - this.textbox.y;
        } else if (this.currentTool === 'text') {
          // 开始创建文本框
          this.isAddingText = true;
          this.textbox.x = this.startX;
          this.textbox.y = this.startY;
          this.textbox.width = 200;
          this.textbox.height = 100;
          this.textbox.content = '';
          this.textbox.fontSize = this.fontSize;
          this.textbox.isResizing = false;
          this.textbox.isDragging = false;
          this.textbox.resizeHandle = null;
        }
      } else {
        this.isDrawing = true;
        // 为每一笔分配一个唯一的strokeId，使用socketId作为前缀
        this.strokeId++;
        this.currentStrokeId = `${this.socketId}_${this.strokeId}`;
      }
    },
    draw(e) {
      if (!this.isDrawing && !this.isAddingText) return;
      
      const rect = this.canvas.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      
      // 实时更新结束坐标
      this.lastX = currentX;
      this.lastY = currentY;
      
      if ((this.currentTool === 'text' || this.currentTool === 'mouse') && this.isAddingText) {
        if (this.textbox.isDragging) {
          // 拖动文本框
          this.textbox.x = currentX - this.textbox.dragOffsetX;
          this.textbox.y = currentY - this.textbox.dragOffsetY;
        } else if (this.textbox.isResizing) {
          // 调整文本框大小
          this.textbox.width = Math.max(50, currentX - this.textbox.x);
          this.textbox.height = Math.max(30, currentY - this.textbox.y);
        } else {
          // 创建文本框时调整大小
          this.textbox.width = Math.max(50, currentX - this.textbox.x);
          this.textbox.height = Math.max(30, currentY - this.textbox.y);
        }
        
        // 清空画布并重新绘制所有元素
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.redrawElements();
        
        // 绘制文本框
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.strokeRect(this.textbox.x, this.textbox.y, this.textbox.width, this.textbox.height);
        
        // 绘制调整手柄
        const resizeHandleSize = 8;
        this.ctx.fillStyle = this.color;
        this.ctx.fillRect(
          this.textbox.x + this.textbox.width - resizeHandleSize,
          this.textbox.y + this.textbox.height - resizeHandleSize,
          resizeHandleSize,
          resizeHandleSize
        );
        
        // 不再提前绘制文本内容，只在textarea中显示

      } else if (this.currentTool === 'pen') {
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
      } else if (this.currentTool === 'rectangle' || this.currentTool === 'circle' || this.currentTool === 'diamond' || this.currentTool === 'arrow') {
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
        } else if (this.currentTool === 'diamond') {
          const centerX = (this.startX + currentX) / 2;
          const centerY = (this.startY + currentY) / 2;
          const width = Math.abs(currentX - this.startX) / 2;
          const height = Math.abs(currentY - this.startY) / 2;
          
          this.ctx.beginPath();
          this.ctx.moveTo(centerX, centerY - height);
          this.ctx.lineTo(centerX + width, centerY);
          this.ctx.lineTo(centerX, centerY + height);
          this.ctx.lineTo(centerX - width, centerY);
          this.ctx.closePath();
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
        if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
          // 画笔和橡皮都已经在draw方法中逐段保存，不需要额外处理
        } else if (this.currentTool === 'rectangle' || this.currentTool === 'circle' || this.currentTool === 'diamond' || this.currentTool === 'arrow') {
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
          // 注意绘制矩形等图形因为生成预览图形并不是真实绘制，因此需要存入elements再使用redrawElements重绘；
          this.ctx.clearRect(0, 0, this.width, this.height);
          this.redrawElements();
        }
        this.isDrawing = false;
      } else if (this.isAddingText) {
        // 文本框创建、调整或拖动完成
        if (this.textbox.isResizing) {
          // 调整完成，重置调整状态
          this.textbox.isResizing = false;
          this.textbox.resizeHandle = null;
        } else if (this.textbox.isDragging) {
          // 拖动完成，重置拖动状态
          this.textbox.isDragging = false;
        }
        
        // 保持isAddingText为true，显示文本输入界面
        // 重新绘制画布，显示文本框
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.redrawElements();
        
        // 绘制文本框
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.strokeRect(this.textbox.x, this.textbox.y, this.textbox.width, this.textbox.height);
        
        // 绘制调整手柄
        const resizeHandleSize = 8;
        this.ctx.fillStyle = this.color;
        this.ctx.fillRect(
          this.textbox.x + this.textbox.width - resizeHandleSize,
          this.textbox.y + this.textbox.height - resizeHandleSize,
          resizeHandleSize,
          resizeHandleSize
        );
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
          } else if (element.type === 'diamond') {
            const centerX = (element.startX + element.lastX) / 2;
            const centerY = (element.startY + element.lastY) / 2;
            const width = Math.abs(element.lastX - element.startX) / 2;
            const height = Math.abs(element.lastY - element.startY) / 2;
            
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, centerY - height);
            this.ctx.lineTo(centerX + width, centerY);
            this.ctx.lineTo(centerX, centerY + height);
            this.ctx.lineTo(centerX - width, centerY);
            this.ctx.closePath();
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
            // 使用element.fontSize作为字体大小，如果没有则使用默认值16
            const fontSize = element.fontSize || 16;
            this.ctx.font = `${fontSize}px Arial`;
            
            // 处理多行文本，考虑文本框宽度自动换行
            const lines = this.wrapText(element.text, element.width - 20, fontSize);
            const lineHeight = fontSize * 1.2;
            lines.forEach((line, index) => {
              this.ctx.fillText(line, element.x + 10, element.y + 30 + index * lineHeight);
            });
          }
        }
      });
    },
    updateTextPreview() {
      // 实时更新画布上的文本预览
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.redrawElements();
      
      // 绘制文本框
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = this.lineWidth;
      this.ctx.strokeRect(this.textbox.x, this.textbox.y, this.textbox.width, this.textbox.height);
      
      // 绘制调整手柄
      const resizeHandleSize = 8;
      this.ctx.fillStyle = this.color;
      this.ctx.fillRect(
        this.textbox.x + this.textbox.width - resizeHandleSize,
        this.textbox.y + this.textbox.height - resizeHandleSize,
        resizeHandleSize,
        resizeHandleSize
      );
      
      // 不再提前绘制文本内容，只在textarea中显示
    },
    wrapText(text, maxWidth, fontSize) {
      const lines = [];
      
      this.ctx.font = `${fontSize}px Arial`;
      
      // 检查文本框是否非常窄，需要垂直排列
      const singleCharWidth = this.ctx.measureText('A').width;
      if (maxWidth < singleCharWidth * 2) {
        // 文本框非常窄，每个字符单独占一行
        for (let i = 0; i < text.length; i++) {
          if (text[i] !== ' ') {
            lines.push(text[i]);
          }
        }
        return lines;
      }
      
      // 正常情况，按单词换行
      let currentLine = '';
      const words = text.split(' ');
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        // 检查单个单词是否已经超过最大宽度
        const wordWidth = this.ctx.measureText(word).width;
        if (wordWidth > maxWidth) {
          // 单个单词超过最大宽度，需要按字符换行
          let currentWordLine = '';
          for (let j = 0; j < word.length; j++) {
            const char = word[j];
            const testLine = currentWordLine + char;
            const testWidth = this.ctx.measureText(testLine).width;
            if (testWidth <= maxWidth) {
              currentWordLine = testLine;
            } else {
              if (currentWordLine) {
                lines.push(currentWordLine);
              }
              currentWordLine = char;
            }
          }
          if (currentWordLine) {
            lines.push(currentWordLine);
          }
        } else {
          // 单个单词未超过最大宽度，按单词换行
          const testLine = currentLine + (currentLine ? ' ' : '') + word;
          const testWidth = this.ctx.measureText(testLine).width;
          
          if (testWidth <= maxWidth) {
            currentLine = testLine;
          } else {
            if (currentLine) {
              lines.push(currentLine);
            }
            currentLine = word;
          }
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
      return lines;
    },
    cancelTextInput() {
      this.isAddingText = false;
      this.textbox.content = '';
      // 清空画布并重新绘制所有元素，隐藏文本框
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.redrawElements();
    },
    handleTextareaBlur(event) {
      // 检查是否是因为点击确认按钮而导致的blur事件
      const target = event.relatedTarget;
      if (target && target.closest && target.closest('.text-input-button')) {
        // 点击了确认按钮，不执行取消操作
        return;
      }
      // 其他情况，执行取消操作
      this.cancelTextInput();
    },
    finishTextInput() {
      if (this.textbox.content) {
        // 保存文本到elements数组
        const element = {
          type: 'text',
          x: this.textbox.x,
          y: this.textbox.y,
          width: this.textbox.width,
          height: this.textbox.height,
          text: this.textbox.content,
          color: this.color,
          fontSize: this.textbox.fontSize
        };
        this.elements.push(element);
        
        // 发送到服务器
        this.sendWebSocketMessage('text', element);
        
        // 添加到转录历史
        this.transcriptionHistory.push(this.textbox.content);
      }
      this.isAddingText = false;
      this.textbox.content = '';
      // 清空画布并重新绘制所有元素，隐藏文本框
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.redrawElements();
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
        // 检查浏览器是否支持媒体设备API
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('浏览器不支持媒体设备API');
        }
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
        // 保存原始元素和当前strokeId，用于撤销美化
        this.originalElements = {
          elements: JSON.parse(JSON.stringify(this.elements)),
          strokeId: this.currentStrokeId
        };
        
        const response = await fetch('http://192.168.248.168:8080/api/recognize-shape', {
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
          this.elements = this.originalElements.elements;
          // 清空原始元素的保存
          const strokeId = this.originalElements.strokeId;
          this.originalElements = null;
          // 重新绘制画布
          this.redrawCanvas();
          // 发送撤销美化指令到服务器，包含strokeId
          this.sendWebSocketMessage('undoBeautify', { strokeId });
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
          } else if (element.type === 'diamond') {
            return '菱形图形';
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
        
        const response = await fetch('http://192.168.248.168:8080/api/generate-summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            whiteboardContent,
            transcriptionHistory: this.transcriptionHistory.map(item => {
              if (typeof item === 'object' && item.text) {
                return `${item.speaker}: ${item.text}`;
              }
              return item;
            }).join('\n')
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
    // 保存昵称
    saveNickname() {
      if (this.nickname) {
        localStorage.setItem('nickname', this.nickname);
        // 发送昵称更新消息到服务器
        this.sendWebSocketMessage('updateNickname', { nickname: this.nickname });
        this.showNicknameInput = false;
      }
    },
    // 打印所有发言内容
    printTranscriptionHistory() {
      console.log('所有发言内容:');
      if (this.transcriptionHistory.length > 0) {
        this.transcriptionHistory.forEach((content, index) => {
          if (typeof content === 'object' && content.text) {
            console.log(`${index + 1}. ${content.speaker}: ${content.text}`);
          } else {
            console.log(`${index + 1}. ${content}`);
          }
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
      
      // 按发言人分组
      const groupedBySpeaker = {};
      this.transcriptionBuffer.forEach(item => {
        if (item.text && item.text.trim() !== '') {
          if (!groupedBySpeaker[item.speaker]) {
            groupedBySpeaker[item.speaker] = [];
          }
          groupedBySpeaker[item.speaker].push(item.text);
        }
      });
      
      // 处理每个发言人的转录结果
      for (const speaker in groupedBySpeaker) {
        const texts = groupedBySpeaker[speaker];
        // 去除前缀重复的内容，只保留最长的版本
        const uniqueTexts = this.removePrefixDuplicates(texts);
        
        // 将去重后的结果添加到历史记录
        uniqueTexts.forEach(text => {
          const transcriptionItem = { speaker, text };
          // 检查是否与历史记录最后一条完全重复
          if (this.transcriptionHistory.length === 0) {
            // 如果历史记录为空，直接添加
            this.transcriptionHistory.push(transcriptionItem);
            console.log('添加到转录历史:', transcriptionItem);
          } else {
            const lastItem = this.transcriptionHistory[this.transcriptionHistory.length - 1];
            
            // 检查是否是同一个发言人
            if (lastItem.speaker === speaker) {
              // 检查当前文本是否是历史记录最后一条的前缀
              if (this.isPrefixWithPunctuation(text, lastItem.text)) {
                // 如果是前缀，不添加
                console.log('当前文本是历史记录最后一条的前缀，不添加:', text);
              } 
              // 检查历史记录最后一条是否是当前文本的前缀
              else if (this.isPrefixWithPunctuation(lastItem.text, text)) {
                // 如果是前缀，替换历史记录最后一条
                this.transcriptionHistory[this.transcriptionHistory.length - 1] = transcriptionItem;
                console.log('替换历史记录最后一条:', transcriptionItem);
              } 
              // 如果不是前缀关系，且不完全重复，添加到历史记录
              else if (lastItem.text !== text) {
                this.transcriptionHistory.push(transcriptionItem);
                console.log('添加到转录历史:', transcriptionItem);
              }
            } else {
              // 不同发言人，直接添加
              this.transcriptionHistory.push(transcriptionItem);
              console.log('添加到转录历史:', transcriptionItem);
            }
          }
        });
      }
      
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
  cursor: v-bind('currentTool === "mouse" ? "default" : "crosshair"');
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

.text-input-wrapper {
  position: absolute;
  z-index: 100;
}

.text-input-container {
  position: relative;
  background-color: white;
  padding: 5px;
  border: 1px solid #ccc;
  border-radius: 3px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  pointer-events: none;
}

.text-input-container textarea {
  border: none;
  outline: none;
  padding: 5px;
  width: 100%;
  height: 100%;
  resize: none;
  font-family: Arial;
  box-sizing: border-box;
  pointer-events: auto;
}

.text-input-button {
  position: absolute;
  right: -60px;
  top: 0;
  padding: 5px;
  background-color: rgba(255, 255, 255, 0.9);
  border: 1px solid #ccc;
  border-radius: 3px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  pointer-events: auto;
}

.text-input-button button {
  padding: 5px 10px;
  border: none;
  border-radius: 3px;
  background-color: #007bff;
  color: white;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
}

.text-input-container textarea {
  pointer-events: auto;
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

/* 多用户字幕容器 */
.multi-subtitle-container {
  position: fixed;
  bottom: 100px;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  z-index: 999;
}

/* 字幕样式 */
.subtitle-container {
  width: 100%;
  display: flex;
  justify-content: center;
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

.speaker-name {
  font-weight: bold;
  color: #409eff;
  margin-right: 8px;
}

.nickname-container {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #333;
  font-size: 14px;
}

.nickname-input {
  display: flex;
  align-items: center;
  gap: 5px;
}

.nickname-input input {
  padding: 3px 6px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 14px;
  width: 120px;
}

.nickname-container button {
  font-size: 12px;
  padding: 2px 6px;
  margin-left: 5px;
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