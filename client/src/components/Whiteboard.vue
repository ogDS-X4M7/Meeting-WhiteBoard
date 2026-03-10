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
      elements: []
    };
  },
  mounted() {
    this.canvas = this.$refs.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.setupCanvas();
  },
  methods: {
    setupCanvas() {
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = this.lineWidth;
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
      
      if (this.currentTool === 'text') {
        this.isAddingText = true;
        setTimeout(() => {
          this.$refs.textInput.focus();
        }, 100);
      } else {
        this.isDrawing = true;
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
          lineWidth: this.lineWidth
        };
        this.elements.push(element);
        
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
          // 重新绘制所有元素
          this.ctx.clearRect(0, 0, this.width, this.height);
          this.redrawElements();
        }
        this.isDrawing = false;
      }
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
          const radius = Math.sqrt(
            Math.pow(element.lastX - element.startX, 2) + Math.pow(element.lastY - element.startY, 2)
          );
          this.ctx.beginPath();
          this.ctx.arc(element.startX, element.startY, radius, 0, Math.PI * 2);
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
      }
      this.isAddingText = false;
      this.textInput = '';
    },
    clearCanvas() {
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.elements = [];
    },
    exportCanvas() {
      const dataURL = this.canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = 'whiteboard.png';
      link.click();
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
</style>
