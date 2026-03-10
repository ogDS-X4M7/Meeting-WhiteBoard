<template>
  <div id="app">
    <h1>多人协作会议白板</h1>
    <Whiteboard />
  </div>
</template>

<script>
import Whiteboard from './components/Whiteboard.vue'

export default {
  name: 'App',
  components: {
    Whiteboard
  }
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: Arial, sans-serif;
  background-color: #f5f5f5;
}

#app {
  max-width: 1000px;
  margin: 20px auto;
  padding: 20px;
  background-color: white;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

h1 {
  text-align: center;
  margin-bottom: 20px;
  color: #333;
}
</style>
