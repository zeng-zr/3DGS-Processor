const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// 使用已有的真实视频文件
const testFile = path.join(__dirname, 'test-real-video.mp4');

// 确保文件存在
if (!fs.existsSync(testFile)) {
  console.error('测试视频文件不存在:', testFile);
  process.exit(1);
}

async function testProcessorAPI() {
  try {
    console.log('使用真实视频文件:', testFile);
    
    // 测试调用处理器API
    const response = await fetch('http://localhost:3002/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: testFile,
        fileName: 'test-real-video.mp4',
        jobId: Date.now().toString()
      })
    });
    
    const data = await response.json();
    console.log('API响应:', data);
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testProcessorAPI(); 