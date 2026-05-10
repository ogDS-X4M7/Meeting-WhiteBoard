<template>
  <div v-if="isInMeeting" class="meeting-info">
      <h2>会议室: {{ currentRoomCode }}</h2>
      <div class="nickname-container">
        <span v-if="!showNicknameInput">{{ nickname }} <button @click="showNicknameInput = true">修改</button></span>
        <div v-else class="nickname-input">
          <input v-model="nickname" @keyup.enter="saveNickname" @blur="saveNickname" placeholder="输入昵称" />
          <button @click="saveNickname">保存</button>
          <button @click="showNicknameInput = false">取消</button>
        </div>
        <button @click="leaveMeeting" class="btn leave-btn">离开会议</button>
      </div>
      
  </div>
  <div id="app">
    <h1 v-if="!isInMeeting">多人协作会议白板</h1>
    
    <!-- 会议室管理界面 -->
    <div v-if="!isInMeeting" class="meeting-management">
      <div class="meeting-form">
        <h2>创建或加入会议</h2>
        
        <div class="form-group">
          <button @click="createMeeting" class="btn create-btn">创建会议</button>
        </div>
        
        <div class="form-group">
          <h3>加入会议</h3>
          <input 
            type="text" 
            v-model="roomCode" 
            placeholder="请输入会议室代码" 
            class="room-code-input"
            maxlength="6"
          />
          <button @click="joinMeeting" class="btn join-btn" :disabled="!roomCode">加入会议</button>
        </div>
        
        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>
        
        <div v-if="successMessage" class="success-message">
          {{ successMessage }}
        </div>
      </div>
    </div>
    
    <!-- 白板界面 -->
    <div v-else class="whiteboard-container">
      <Whiteboard ref="whiteboard" :roomCode="currentRoomCode" />
    </div>
  </div>
</template>

<script>
import Whiteboard from './components/Whiteboard.vue'

export default {
  name: 'App',
  components: {
    Whiteboard
  },
  data() {
    return {
      isInMeeting: false,
      roomCode: '',
      currentRoomCode: '',
      errorMessage: '',
      successMessage: '',
      showNicknameInput: false,
      nickname: localStorage.getItem('nickname') || `用户${Math.floor(Math.random() * 1000)}`,
    }
  },
  methods: {
    async createMeeting() {
      try {
        this.errorMessage = ''
        const response = await fetch('http://192.168.2.12:8080/api/create-meeting', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        
        const result = await response.json()
        if (result.success) {
          this.currentRoomCode = result.roomCode
          this.isInMeeting = true
          this.successMessage = `会议创建成功！会议室代码：${result.roomCode}`
          setTimeout(() => {
            this.successMessage = ''
          }, 3000)
        } else {
          this.errorMessage = result.error || '创建会议失败'
        }
      } catch (error) {
        this.errorMessage = '网络错误，请稍后重试'
        console.error('创建会议失败:', error)
      }
    },
    
    async joinMeeting() {
      try {
        this.errorMessage = ''
        const response = await fetch('http://192.168.2.12:8080/api/join-meeting', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ roomCode: this.roomCode })
        })
        
        const result = await response.json()
        if (result.success) {
          this.currentRoomCode = result.roomCode
          this.isInMeeting = true
          this.successMessage = '加入会议成功！'
          setTimeout(() => {
            this.successMessage = ''
          }, 3000)
        } else {
          this.errorMessage = result.error || '加入会议失败'
        }
      } catch (error) {
        this.errorMessage = '网络错误，请稍后重试'
        console.error('加入会议失败:', error)
      }
    },
    
    leaveMeeting() {
      // 关闭 WebSocket 连接
      // if (this.$refs.whiteboard) {
      //   this.$refs.whiteboard.closeWebSocket();
        
      //   // 延迟切换到会议管理界面，确保WebSocket连接完全关闭
      //   setTimeout(() => {
      //     // 切换到会议管理界面
      //     this.isInMeeting = false
      //     this.currentRoomCode = ''
      //     this.roomCode = ''
      //     console.log('离开会议成功');
      //   }, 500);
      // } else {
      //   // 如果没有whiteboard组件，直接切换到会议管理界面
      //   this.isInMeeting = false
      //   this.currentRoomCode = ''
      //   this.roomCode = ''
      //   console.log('离开会议成功');
      // }
      this.isInMeeting = false
      this.currentRoomCode = ''
      this.roomCode = ''
      console.log('离开会议成功');
    },
    saveNickname() {
      if (this.nickname) {
        localStorage.setItem('nickname', this.nickname);
        // 发送昵称更新消息到服务器
        this.$refs.whiteboard.sendWebSocketMessage('updateNickname', { nickname: this.nickname });
        this.showNicknameInput = false;
      }
    },
  }
}
</script>

<style lang="less">
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: Arial, sans-serif;
  background-color: #f5f5f5;
}

.meeting-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2vw;
  padding: 1vw;
  background-color: #f9f9f9;
  border-radius: 4px;
  h2 {
    font-size: 1vw;
    color: #333;
  }
  .nickname-container {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #333;
    font-size: 1vw;
    button {
      font-size: 0.8vw;
      padding: 0.1vw 0.3vw;
      margin-left: 0.5vw;
    }
    .leave-btn {
      background-color: #f44336;
      color: white;
      padding: 0.4vw 0.8vw;
      font-size: 0.8vw;
    }
    .leave-btn:hover {
      background-color: #da190b;
    }
    .nickname-input {
      display: flex;
      align-items: center;
      gap: 5px;
      input {
        padding: 3px 6px;
        border: 1px solid #ccc;
        border-radius: 3px;
        font-size: 14px;
        width: 120px;
      }
    }
  }

}

#app {
  // display: flex;
  // justify-content: center;
  max-width: 80vw;
  margin: 2vh auto;
  padding: 1vw;
  background-color: white;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  h1 {
    text-align: center;
    margin-bottom: 30px;
    color: #333;
  }
}


/* 会议室管理界面 */
.meeting-management {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  .meeting-form {
    width: 100%;
    max-width: 400px;
    padding: 30px;
    background-color: #f9f9f9;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    h2 {
      text-align: center;
      margin-bottom: 20px;
      color: #333;
    }
    h3 {
      margin-bottom: 10px;
      color: #555;
      font-size: 16px;
    }

    .form-group {
      margin-bottom: 20px;
      .create-btn {
        width: 100%;
        background-color: #4CAF50;
        color: white;
      }
      .create-btn:hover {
        background-color: #45a049;
      }
      .join-btn {
        width: 100%;
        background-color: #2196F3;
        color: white;
        margin-top: 10px;
      }
      .join-btn:hover {
        background-color: #0b7dda;
      }
      .join-btn:disabled {
        background-color: #cccccc;
        cursor: not-allowed;
      }
      .room-code-input {
        width: 100%;
        padding: 12px;
        font-size: 16px;
        border: 1px solid #ddd;
        border-radius: 4px;
        text-align: center;
        letter-spacing: 2px;
        font-family: monospace;
      }
    }

    .error-message {
      background-color: #ffebee;
      color: #c62828;
      padding: 10px;
      border-radius: 4px;
      margin-top: 15px;
      text-align: center;
    }
    
    .success-message {
      background-color: #e8f5e8;
      color: #2e7d32;
      padding: 10px;
      border-radius: 4px;
      margin-top: 15px;
      text-align: center;
    }
  }
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.3s;
}

/* 白板界面 */
.whiteboard-container {
  margin-top: 0.5vw;
}

</style>
