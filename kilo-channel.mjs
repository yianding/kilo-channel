#!/usr/bin/env node

/**
 * Kilo Channel - 正确的 OpenClaw/WorkBuddy Channel 实现
 * 
 * 工作原理：
 * 1. 作为 MCP 服务器通过 stdio 与 WorkBuddy 通信
 * 2. 在本地启动 HTTP 服务器接收 Kilo Webhook 推送
 * 3. 收到消息后发送 notifications/anthropic/channel 通知到 WorkBuddy
 * 4. WorkBuddy 的 AI 会自动处理消息，并通过已加载的 Kilo MCP 工具发送回复
 * 
 * 使用方法：
 * 1. 在 mcp.json 中注册此 channel（路径见下方 CONFIG_FILE 说明）
 * 2. 配置 Kilo 的 webhook_url 为本服务监听地址（端口见下方 WEBHOOK_PORT 说明）
 * 3. 启动 WorkBuddy 时加载 channel：codebuddy --channels server:kilo-channel
 *
 * 环境变量（均可选，均有默认值）：
 *   KILO_CHANNEL_PORT    监听端口，默认 8090
 *   KILO_CHANNEL_CONFIG  Kilo 配置文件路径，默认 $HOME/.workbuddy/mcp.json
 *   KILO_MCP_URL         Kilo MCP 服务地址，默认 http://127.0.0.1:9090/mcp
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import http from 'http'
import fs from 'fs'

// ============ 配置 ============
const CHANNEL_NAME = 'kilo'
const WEBHOOK_PORT = parseInt(process.env.KILO_CHANNEL_PORT || '8090', 10)
const KILO_MCP_URL = process.env.KILO_MCP_URL || 'http://127.0.0.1:9090/mcp'
const CONFIG_FILE = process.env.KILO_CHANNEL_CONFIG ||
  `${(process.env.HOME || process.env.USERPROFILE || '')}/.workbuddy/mcp.json`

// ============ 从配置文件读取 Kilo 配置 ============

function loadKiloConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    const kiloConf = config.mcpServers.kilo
    const token = kiloConf.headers.Authorization
    return {
      token: token.startsWith('Bearer ') ? token.slice(7) : token,
      url: kiloConf.url || KILO_MCP_URL
    }
  } catch (e) {
    console.error('[Kilo Channel] 读取配置文件失败:', e.message)
    return { token: '', url: KILO_MCP_URL }
  }
}

// ============ 创建 MCP 服务器 ============

const mcp = new Server(
  { name: CHANNEL_NAME, version: '1.0.0' },
  {
    capabilities: {
      experimental: {
        'claude/channel': {}  // 声明为 channel，必须用 claude/channel 才能被 WorkBuddy 识别
      }
      // 注意：不暴露 tools，因为 WorkBuddy 已经通过 mcp.json 加载了 Kilo MCP 工具
      // AI 会直接使用 mcp__kilo__kilo_send_message 工具回复
    },
    instructions: `你是 Kilo 聊天助手。
当收到 <channel source="kilo" sender="..."> 标签的消息时，仔细阅读并回复。
回复时请使用 mcp__kilo__kilo_send_message 工具发送到正确的联系人（sender 字段）。`
  }
)

// ============ 启动 HTTP 服务器接收 Kilo Webhook ============

let mcpReady = false

const server = http.createServer(async (req, res) => {
  // 只处理 POST 请求
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain' })
    res.end('Method Not Allowed')
    return
  }
  
  try {
    // 读取请求体
    const body = await new Promise((resolve, reject) => {
      let data = ''
      req.on('data', chunk => data += chunk)
      req.on('end', () => resolve(data))
      req.on('error', reject)
    })
    
    const payload = JSON.parse(body)
    console.error(`[Kilo Channel] 收到 Webhook: ${JSON.stringify(payload, null, 2)}`)
    
    // 处理消息类型
    if (payload.type === 'message') {
      const msg = payload.message
      const sender = msg.sender
      const text = msg.text
      const messageId = msg.id || `msg_${Date.now()}`
      
      console.error(`[Kilo Channel] 收到来自 ${sender} 的消息: ${text}`)
      
        // 发送通知到 WorkBuddy
      try {
        if (!mcpReady) {
          console.error(`[Kilo Channel] ⚠️  MCP 连接尚未就绪，消息将不会被推送`)
          res.writeHead(503, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'MCP connection not ready' }))
          return
        }
        await mcp.notification({
          method: 'notifications/claude/channel',
          params: {
            content: text,
            meta: {
              source: CHANNEL_NAME,
              sender: sender,
              message_id: messageId,
              timestamp: String(msg.timestamp || Date.now())
            }
          }
        })
        console.error(`[Kilo Channel] ✅ 已推送消息到 WorkBuddy`)
      } catch (e) {
        console.error(`[Kilo Channel] ❌ 推送失败: ${e.message}`)
      }
      
      // 返回成功响应
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, message: 'Message forwarded to WorkBuddy' }))
      return
    }
    
    // 其他类型忽略
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, ignored: true }))
    
  } catch (e) {
    console.error(`[Kilo Channel] Webhook 处理错误: ${e.message}`)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: e.message }))
  }
})

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[Kilo Channel] ❌ 端口 ${WEBHOOK_PORT} 已被占用，请先关闭占用该端口的进程`)
    console.error(`[Kilo Channel]    执行: lsof -ti:${WEBHOOK_PORT} | xargs kill -9`)
  } else {
    console.error(`[Kilo Channel] ❌ HTTP 服务器错误: ${e.message}`)
  }
  process.exit(1)
})

server.listen(WEBHOOK_PORT, '127.0.0.1', () => {
  console.error(`[Kilo Channel] ✅ HTTP 服务器已启动`)
  console.error(`[Kilo Channel] 📡 监听地址: http://127.0.0.1:${WEBHOOK_PORT}`)
  console.error(`[Kilo Channel] 🔗 请在 Kilo 配置中设置:`)
  console.error(`[Kilo Channel]    webhook_url: http://127.0.0.1:${WEBHOOK_PORT}`)
  console.error(`[Kilo Channel] `)
  console.error(`[Kilo Channel] 📝 工作原理:`)
  console.error(`[Kilo Channel]   1. Kilo 发送消息 → Webhook → 本服务器`)
  console.error(`[Kilo Channel]   2. 服务器推送通知到 WorkBuddy`)
  console.error(`[Kilo Channel]   3. WorkBuddy AI 处理消息`)
  console.error(`[Kilo Channel]   4. AI 调用 mcp__kilo__kilo_send_message 工具回复`)
  console.error(`[Kilo Channel]   5. 回复发送到 Kilo`)
})

// ============ 连接到 stdio transport ============

mcp.connect(new StdioServerTransport()).then(() => {
  mcpReady = true
  console.error(`[Kilo Channel] ✅ 已连接到 WorkBuddy via stdio`)
  console.error(`[Kilo Channel] 📱 现在可以从 Kilo 发送消息，WorkBuddy 会自动回复！`)
}).catch((e) => {
  console.error(`[Kilo Channel] ❌ 连接失败: ${e.message}`)
  process.exit(1)
})

// ============ 优雅退出 ============

process.on('SIGINT', () => {
  console.error('\n[Kilo Channel] 正在停止...')
  server.close(() => {
    console.error('[Kilo Channel] ✅ 已停止')
    process.exit(0)
  })
})
