const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const morgan = require("morgan");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const http = require("http");

// 日志格式化助手函数
const logFormat = {
  info: (message) => console.log(`\x1b[34m[INFO]\x1b[0m [${new Date().toISOString()}] ${message}`),
  success: (message) => console.log(`\x1b[32m[SUCCESS]\x1b[0m [${new Date().toISOString()}] ${message}`),
  warning: (message) => console.log(`\x1b[33m[WARNING]\x1b[0m [${new Date().toISOString()}] ${message}`),
  error: (message) => console.error(`\x1b[31m[ERROR]\x1b[0m [${new Date().toISOString()}] ${message}`),
  websocket: (message) => console.log(`\x1b[36m[WEBSOCKET]\x1b[0m [${new Date().toISOString()}] ${message}`),
  process: (message) => console.log(`\x1b[35m[PROCESS]\x1b[0m [${new Date().toISOString()}] ${message}`),
  api: (message) => console.log(`\x1b[90m[API]\x1b[0m [${new Date().toISOString()}] ${message}`)
};

// 配置
const PORT = process.env.PORT || 3002;
const FRAMES_OUTPUT_DIR = path.join(__dirname, "extracted_frames");
const COLMAP_OUTPUT_DIR = path.join(__dirname, "colmap_output");
const { URL } = require("url");

fs.mkdirSync(FRAMES_OUTPUT_DIR, { recursive: true });
fs.mkdirSync(COLMAP_OUTPUT_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);

// 设置CORS，允许所有来源访问
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 创建WebSocket服务器，并配置为允许所有来源
const wss = new WebSocket.Server({ 
  server,
  // 启用跨域支持
  verifyClient: (info) => {
    // 允许所有来源的WebSocket连接
    logFormat.websocket(`收到连接请求: ${info.origin} -> ${info.req.url}`);
    return true;
  }
});

const clients = new Map();

app.use(morgan("dev")); // 日志
// app.use(bodyParser.json());// 解析json为req.body : { key: 'value' }
app.use(express.json()); // 替代 bodyParser.json()

const jobStatus = new Map();

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const jobId = url.searchParams.get("jobId"); //获取jobId
  // 客户端连接管理
  if (jobId) {
    logFormat.websocket(`客户端已连接，jobId: ${jobId}`);
    clients.set(jobId, ws); // 将jobId和ws连接存储在clients中
    if (jobStatus.has(jobId)) {
      logFormat.websocket(`发送已有状态给客户端, jobId: ${jobId}, 状态: ${JSON.stringify(jobStatus.get(jobId))}`);
      ws.send(JSON.stringify(jobStatus.get(jobId))); // 发送jobStatus到客户端
    }
    ws.on("close", () => {
      //客户端断开连接时
      logFormat.websocket(`客户端已断开连接，jobId: ${jobId}`);
      clients.delete(jobId); // 删除jobId对应的ws连接
    });
  } else {
    logFormat.warning(`客户端连接但未提供jobId`);
  }
});

function updateJobStatus(jobId, status) {
  logFormat.info(`任务状态更新: jobId: ${jobId}, 状态: ${JSON.stringify(status)}`);
  jobStatus.set(jobId, status);

  const client = clients.get(jobId);
  if (client && client.readyState === WebSocket.OPEN) {
    try {
      logFormat.websocket(`发送状态更新给客户端, jobId: ${jobId}`);
      client.send(JSON.stringify(status));
    } catch (error) {
      logFormat.error(`发送状态给客户端失败, jobId: ${jobId}: ${error}`);
      clients.delete(jobId); // 断开异常连接
    }
  } else {
    logFormat.warning(`找不到客户端或连接未打开, jobId: ${jobId}`);
  }
}

app.post("/api/process", async (req, res) => {
  logFormat.api(`收到处理请求`);
  
  try {
    logFormat.api(`请求体: ${JSON.stringify(req.body)}`);
    const { filePath, fileName, jobId } = req.body;

    // 校验文件路径
    if (!filePath || !fs.existsSync(filePath)) {
      logFormat.error(`无效的文件路径: ${filePath}`);
      return res.status(400).json({ error: "Invalid file path" });
    }
    
    logFormat.api(`文件存在: ${filePath}`);

    // 生成唯一 jobId（使用 UUID 更可靠）
    const processingJobId = jobId || crypto.randomUUID();
    const outputDir = path.join(FRAMES_OUTPUT_DIR, processingJobId);

    logFormat.api(`使用jobId: ${processingJobId}, 输出目录: ${outputDir}`);

    // 创建输出目录
    fs.mkdirSync(outputDir, { recursive: true });
    logFormat.api(`已创建输出目录: ${outputDir}`);

    // 初始化任务状态
    updateJobStatus(processingJobId, {
      jobId: processingJobId,
      status: "processing",
      stage: "initializing",
      progress: 0,
      fileName,
      outputDir,
      createdAt: new Date().toISOString(),
    });

    logFormat.api(`已初始化任务状态, 返回响应, jobId: ${processingJobId}`);
    res.status(202).json({
      jobId: processingJobId,
      message: "Processing started",
    });

    // 异步处理视频（捕获错误）
    logFormat.api(`开始异步处理视频, jobId: ${processingJobId}`);
    processVideo(filePath, processingJobId, outputDir).catch((error) => {
      logFormat.error(
        `[处理错误] jobId ${processingJobId}:`,
        error
      );
      updateJobStatus(processingJobId, {
        status: "failed",
        stage: "error",
        progress: 100,
        error: error.message,
      });
      fs.rmSync(outputDir, { recursive: true, force: true }); // 清理输出目录
    });
  } catch (error) {
    logFormat.error("[API] /api/process发生意外错误:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [jobId, status] of jobStatus.entries()) {
    if (now - new Date(status.createdAt).getTime() > 24 * 60 * 60 * 1000) {
      jobStatus.delete(jobId);
      clients.delete(jobId);
    }
  }
}, 120 * 60 * 1000); // 每2小时清理一次

app.get("/api/status/:jobId", (req, res) => {
  const { jobId } = req.params;

  if (jobStatus.has(jobId)) {
    res.json(jobStatus.get(jobId));
  } else {
    res.status(404).json({ error: "Job not found" });
  }
});

// API路由：获取已处理作业列表
app.get("/api/jobs", (req, res) => {
  const jobs = Array.from(jobStatus.values());
  res.json(jobs);
});

async function processVideo(videoPath, jobId, outputDir) {
  logFormat.info(`开始处理视频, jobId: ${jobId}, 视频路径: ${videoPath}`);
  try {
    logFormat.info(`更新状态为extracting_frames, jobId: ${jobId}`);
    updateJobStatus(jobId, {
      ...jobStatus.get(jobId),
      stage: "extracting_frames",
      progress: 0, // 从0%开始
    });
    
    logFormat.info(`开始提取帧, jobId: ${jobId}`);
    await extractFrames(videoPath, outputDir, jobId);
    logFormat.info(`帧提取完成, jobId: ${jobId}`);

    // 更新状态为帧提取完成
    const framesCount = fs.readdirSync(outputDir).length;
    logFormat.info(`共提取了${framesCount}帧, jobId: ${jobId}`);
    
    updateJobStatus(jobId, {
      ...jobStatus.get(jobId),
      stage: "frames_extracted",
      progress: 100, // 设置为100%表示该阶段完成
      framesCount: framesCount,
      framesDir: outputDir,
    });

    // 模拟COLMAP优化过程
    logFormat.info(`开始模拟COLMAP优化, jobId: ${jobId}`);
    await simulateColmapOptimization(jobId);
    logFormat.info(`COLMAP优化模拟完成, jobId: ${jobId}`);

    // 模拟高斯泼溅优化过程
    logFormat.info(`开始模拟高斯泼溅优化, jobId: ${jobId}`);
    await simulateGaussianSplatting(jobId);
    logFormat.info(`高斯泼溅优化模拟完成, jobId: ${jobId}`);

    // 更新最终状态
    logFormat.info(`处理完成, 更新最终状态, jobId: ${jobId}`);
    updateJobStatus(jobId, {
      ...jobStatus.get(jobId),
      status: "completed",
      stage: "ready",
      progress: 100,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    logFormat.error(`[处理错误] jobId ${jobId}:`, error);

    // 更新状态为出错
    updateJobStatus(jobId, {
      ...jobStatus.get(jobId),
      status: "failed",
      error: error.message,
      progress: 0,
    });
  }
}

function extractFrames(videoPath, outputDir, jobId) {
  logFormat.info(`开始提取帧, jobId: ${jobId}`);
  
  return new Promise((resolve, reject) => {
    // 每秒提取1帧 (-r 1)，并输出为高质量JPEG
    logFormat.info(`执行命令, jobId: ${jobId}, 视频路径: ${videoPath}, 输出目录: ${outputDir}`);
    
    const ffmpeg = spawn("ffmpeg", [
      "-i",
      videoPath,
      "-r",
      "2", // 每秒2帧
      "-q:v",
      "1", // 最高质量
      "-f",
      "image2", // 图像序列输出
      path.join(outputDir, "frame_%04d.jpg"), // 输出文件名格式
    ]);

    let stdoutData = "";
    let stderrData = "";

    ffmpeg.stdout.on("data", (data) => {
      stdoutData += data.toString();
      logFormat.info(`[ffmpeg stdout] ${data.toString()}`);
    });

    ffmpeg.stderr.on("data", (data) => {
      stderrData += data.toString();
      logFormat.info(`[ffmpeg stderr] ${data.toString()}`);

      // 从FFmpeg输出中尝试解析进度
      const progressMatch = stderrData.match(/frame=\s*(\d+)/g);
      if (progressMatch) {
        const frameNumber = parseInt(
          progressMatch[progressMatch.length - 1].split("=")[1].trim()
        );

        // 假设总帧数为500，计算进度百分比
        const progress = Math.min((frameNumber / 500) * 100, 100); // 0-100%的总进度区间

        updateJobStatus(jobId, {
          ...jobStatus.get(jobId),
          progress: Math.round(progress),
        });
      }
    });
    ffmpeg.on("close", (code) => {
      logFormat.info(`进程结束, 返回码: ${code}, jobId: ${jobId}`);
      
      if (code === 0) {
        logFormat.info(`成功完成, jobId: ${jobId}`);
        resolve();
      } else {
        logFormat.error(`失败, 返回码: ${code}, jobId: ${jobId}`);
        reject(
          new Error(`FFmpeg process exited with code ${code}: ${stderrData}`)
        );
      }
    });
  });
}

// 模拟COLMAP优化过程的函数
async function simulateColmapOptimization(jobId) {
  return new Promise((resolve) => {
    updateJobStatus(jobId, {
      ...jobStatus.get(jobId),
      stage: "colmap_optimization",
      progress: 0, // 从0%开始
    });

    // 模拟进度增加，每次更新间隔为1000毫秒，共40次，从0%到100%进度
    let progress = 0;
    const interval = 1000; // 1000毫秒更新一次
    const progressIncrement = 2.5; // 每次增加2.5%
    const totalUpdates = 40; // 总共更新40次 (约40秒)
    
    let updateCount = 0;
    const progressTimer = setInterval(() => {
      updateCount++;
      progress += progressIncrement;
      
      if (updateCount >= totalUpdates || progress >= 100) {
        clearInterval(progressTimer);
        updateJobStatus(jobId, {
          ...jobStatus.get(jobId),
          stage: "colmap_optimization",
          progress: 100,
        });
        resolve();
      } else {
        updateJobStatus(jobId, {
          ...jobStatus.get(jobId),
          stage: "colmap_optimization",
          progress,
        });
      }
    }, interval);
  });
}

// 模拟高斯泼溅优化过程的函数
async function simulateGaussianSplatting(jobId) {
  return new Promise((resolve) => {
    updateJobStatus(jobId, {
      ...jobStatus.get(jobId),
      stage: "gaussian_splatting",
      progress: 0, // 从0%开始
    });

    // 模拟进度增加，每次更新间隔为1000毫秒，共50次，从0%到100%进度
    let progress = 0;
    const interval = 1000; // 1000毫秒更新一次
    const progressIncrement = 2; // 每次增加2%
    const totalUpdates = 50; // 总共更新50次 (约50秒)
    
    let updateCount = 0;
    const progressTimer = setInterval(() => {
      updateCount++;
      progress += progressIncrement;
      
      if (updateCount >= totalUpdates || progress >= 100) {
        clearInterval(progressTimer);
        updateJobStatus(jobId, {
          ...jobStatus.get(jobId),
          stage: "gaussian_splatting",
          progress: 100,
        });
        resolve();
      } else {
        updateJobStatus(jobId, {
          ...jobStatus.get(jobId),
          stage: "gaussian_splatting",
          progress,
        });
      }
    }, interval);
  });
}

server.listen(PORT, () => {
  logFormat.info(`3DGS Processing Server running on port ${PORT}`);
});
