const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// 使用之前创建的真实测试视频
const testVideoPath = path.join(__dirname, 'test-real-video.mp4');

// 检查视频文件存在
if (!fs.existsSync(testVideoPath)) {
  console.error('测试视频文件不存在:', testVideoPath);
  process.exit(1);
}

async function uploadVideo() {
  try {
    // 创建 FormData 对象
    const form = new FormData();
    
    // 添加文件到表单
    const fileStream = fs.createReadStream(testVideoPath);
    form.append('file', fileStream, {
      filename: 'test-video.mp4',
      contentType: 'video/mp4'
    });
    
    console.log('正在上传视频到 Next.js API...');
    
    // 发送请求到 Next.js 的上传 API
    const response = await fetch('http://localhost:3001/api/upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP 错误: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('上传成功，响应:', data);
    console.log('\n现在请打开浏览器访问 http://localhost:3001 查看处理进度');
    
  } catch (error) {
    console.error('上传失败:', error);
  }
}

uploadVideo(); 