# 3DGS-Processor

3D Gaussian Splatting 视频处理服务，用于从视频中提取帧并为3D重建做准备。

## 功能概述

3DGS-Processor是一个Node.js后端服务，负责处理视频文件并为基于3D Gaussian Splatting技术的三维重建做准备。主要功能包括：

- 接收上传的视频文件
- 使用FFmpeg提取视频帧
- 提供WebSocket实时进度反馈
- 支持RESTful API状态查询
- 为下游3D重建工作流程准备数据

## 系统架构

- **服务器**：基于Express.js的HTTP和WebSocket服务
- **视频处理**：使用child_process调用FFmpeg提取视频帧
- **实时通信**：通过ws库实现WebSocket连接
- **状态管理**：使用Map数据结构管理处理任务状态
- **日志系统**：彩色格式化日志输出

## 安装与使用

### 前提条件

- Node.js (v14+)
- FFmpeg (用于视频处理)

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-username/3DGS-Processor.git
cd 3DGS-Processor

# 安装依赖
npm install
```

### 配置

主要配置位于服务器脚本顶部：

```javascript
const PORT = process.env.PORT || 3002;
const FRAMES_OUTPUT_DIR = path.join(__dirname, "extracted_frames");
const COLMAP_OUTPUT_DIR = path.join(__dirname, "colmap_output");
```

### 运行

```bash
# 开发模式（带热重载）
npm run dev

# 生产模式
npm start
```

## API文档

### 视频处理API

**POST /api/process**

开始处理视频文件。

请求体：
```json
{
  "filePath": "/path/to/video/file",
  "fileName": "video.mp4",
  "jobId": "optional-custom-id"
}
```

响应：
```json
{
  "jobId": "processing-job-id",
  "message": "Processing started"
}
```

### 状态查询API

**GET /api/status/:jobId**

查询处理任务的状态。

响应：
```json
{
  "jobId": "processing-job-id",
  "status": "processing|completed|failed",
  "stage": "initializing|extracting_frames|frames_extracted|ready",
  "progress": 75,
  "framesCount": 120,
  "framesDir": "/path/to/frames",
  "error": "Error message if failed"
}
```

### 任务列表API

**GET /api/jobs**

获取所有处理任务的列表。

## WebSocket接口

连接URL格式：`ws://hostname:3002/?jobId=processing-job-id`

接收的消息格式与状态API响应相同。

## 未来开发计划

### 短期目标

1. **COLMAP集成**
   - 添加对COLMAP的调用支持
   - 实现相机参数和稀疏点云提取
   - 支持不同的COLMAP重建质量选项

2. **处理流程优化**
   - 添加视频分析以智能选择关键帧
   - 增加帧提取前的视频预处理（稳定化、修复等）
   - 提高视频处理性能，支持更大/更长的视频

3. **错误处理增强**
   - 更全面的错误处理和恢复机制
   - 添加处理中断和恢复功能
   - 系统资源监控和自动调整

### 中期目标

1. **Gaussian Splatting集成**
   - 直接集成3D Gaussian Splatting训练
   - 支持不同的训练参数配置
   - 提供训练进度实时反馈

2. **结果优化与后处理**
   - 点云滤波和清理
   - 纹理和颜色优化
   - 模型压缩和LOD支持

3. **系统架构优化**
   - 数据库集成用于任务状态持久化
   - 任务队列和调度系统
   - 分布式处理支持

### 长期目标

1. **多媒体升级**
   - 支持图像集合处理
   - 支持不同视频源融合
   - 支持低质量视频的超分辨率增强

2. **高级渲染功能**
   - 生成可直接在Web中展示的3D模型
   - 添加可编辑材质属性
   - 提供编程API以集成自定义渲染效果

3. **云端部署**
   - 提供完整的云端部署文档和脚本
   - 自动伸缩配置
   - 多租户支持

## 贡献指南

欢迎贡献代码、报告问题或提出改进建议！请遵循以下步骤：

1. Fork项目并创建你的特性分支
2. 添加注释并提交变更
3. 推送到你的分支
4. 创建一个Pull Request

## 许可证

[MIT](LICENSE) 