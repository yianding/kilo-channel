# kilo-channel

> Kilo Channel MCP connector for WorkBuddy
> Kilo 的 WorkBuddy Channel MCP 连接器

把 Kilo 的私聊消息通过本地 webhook 转发给 WorkBuddy，由 WorkBuddy 的 AI 自动调用
Kilo MCP 工具回复，实现「Kilo 收消息 → WorkBuddy 自动回」的闭环。

Forwards Kilo private messages to WorkBuddy via a local webhook, where WorkBuddy's AI
automatically replies using the Kilo MCP tools — closing the loop "Kilo receives → WorkBuddy replies".

---

## 目录 / Table of Contents

- [中文说明](#中文说明)
  - [功能简介](#功能简介)
  - [工作原理](#工作原理)
  - [安装](#安装)
  - [运行](#运行)
  - [环境变量](#环境变量)
  - [在 WorkBuddy 中注册](#在-workbuddy-中注册)
  - [配置 Kilo 的 webhook](#配置-kilo-的-webhook)
  - [端口冲突说明](#端口冲突说明)
  - [常见问题排查](#常见问题排查)
- [English Guide](#english-guide)
  - [Overview](#overview)
  - [How it works](#how-it-works)
  - [Install](#install)
  - [Run](#run)
  - [Environment variables](#environment-variables)
  - [Register in WorkBuddy](#register-in-workbuddy)
  - [Configure Kilo webhook](#configure-kilo-webhook)
  - [Port conflicts](#port-conflicts)
  - [Troubleshooting](#troubleshooting)

---

## 中文说明

### 功能简介

`kilo-channel` 是一个 **Channel MCP 服务器**（基于 [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)）：

1. 通过 **stdio** 与 WorkBuddy（或兼容的 MCP 客户端）通信；
2. 在本地启动一个 **HTTP 服务器**，接收 Kilo 推送的 webhook 消息；
3. 收到消息后，向 WorkBuddy 发送 `notifications/claude/channel` 通知；
4. WorkBuddy 的 AI 读取消息，并调用已加载的 `kilo_*` MCP 工具（如
   `kilo_send_message`）把回复发回 Kilo。

> 注意：本服务本身**不提供任何 MCP 工具**（tools/list 返回空列表），它只做消息转发。
> 真正发消息的能力来自 WorkBuddy 里已配置的 Kilo MCP 服务器。

### 工作原理

```
Kilo  ──webhook(POST)──▶  kilo-channel(HTTP :8090)
                              │
                              │  notifications/claude/channel (stdio)
                              ▼
                         WorkBuddy (AI)
                              │
                              │  kilo_send_message (MCP)
                              ▼
                            Kilo  ←── 自动回复
```

### 前置条件

使用本连接器前，请先下载并安装 **Kilo** 客户端：

👉 https://www.aurora-wave.com/kilo/index.html

安装并启动 Kilo 后，才能进行后续的 webhook 与 MCP 配置。

### 安装

需要 Node.js 18+。克隆仓库后安装依赖：

```bash
git clone https://github.com/yianding/kilo-channel.git
cd kilo-channel
npm install
```

`npm install` 会安装 `@modelcontextprotocol/sdk` 等依赖（依赖声明见 `package.json`）。

### 运行

```bash
# 方式一：直接运行
node kilo-channel.mjs

# 方式二：用 npm 脚本
npm start
```

启动成功后会看到类似日志：

```
[Kilo Channel] ✅ HTTP 服务器已启动
[Kilo Channel] 📡 监听地址: http://127.0.0.1:8090
[Kilo Channel] 🔗 请在 Kilo 配置中设置:
[Kilo Channel]    webhook_url: http://127.0.0.1:8090
[Kilo Channel] ✅ 已连接到 WorkBuddy via stdio
```

### 环境变量

所有配置均为可选，不设置时使用默认值。

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `KILO_CHANNEL_PORT` | HTTP webhook 监听端口 | `8090` |
| `KILO_CHANNEL_CONFIG` | Kilo 配置文件路径（用于读取 token / url） | `$HOME/.workbuddy/mcp.json` |
| `KILO_MCP_URL` | Kilo MCP 服务地址（配置缺失时的兜底值） | `http://127.0.0.1:9090/mcp` |

示例：改用 9099 端口并指定配置路径

```bash
KILO_CHANNEL_PORT=9099 \
KILO_CHANNEL_CONFIG=/path/to/mcp.json \
node kilo-channel.mjs
```

### 在 WorkBuddy 中注册

在 WorkBuddy 的 MCP 配置文件（通常为 `~/.workbuddy/mcp.json`）中加入：

```json
{
  "mcpServers": {
    "kilo-channel": {
      "command": "node",
      "args": ["/你的绝对路径/kilo-channel/kilo-channel.mjs"]
    }
  }
}
```

> 若要让 WorkBuddy 在启动时自动加载为 channel，可用：
> `codebuddy --channels server:kilo-channel`

### 配置 Kilo 的 webhook

在 Kilo 中把「webhook 推送地址」配置为：

```
http://127.0.0.1:<端口>
```

默认端口为 `8090`，即 `http://127.0.0.1:8090`。如果你通过 `KILO_CHANNEL_PORT`
改了端口，这里也要对应修改。

### 端口冲突说明

- 同一台机器**只能运行一个** `kilo-channel` 实例（端口唯一）。
- 重复启动会报 `EADDRINUSE`，进程会打印提示并退出：

  ```
  [Kilo Channel] ❌ 端口 8090 已被占用，请先关闭占用该端口的进程
  [Kilo Channel]    执行: lsof -ti:8090 | xargs kill -9
  ```

- 排查占用：`lsof -ti:8090 | xargs kill -9`（替换为你实际使用的端口）。

### 常见问题排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| `Cannot find module '@modelcontextprotocol/sdk'` | 没装依赖 | 在 `kilo-channel` 目录执行 `npm install` |
| `EADDRINUSE` | 端口被其他实例占用 | 关闭占用进程，或改用 `KILO_CHANNEL_PORT` |
| 收不到消息 | Kilo 的 webhook_url 不对 / 未连上 WorkBuddy | 核对 webhook 地址与 WorkBuddy 是否连接 |
| 能收到消息但不回复 | WorkBuddy 未加载 Kilo MCP 工具 | 确认 WorkBuddy 的 `mcp.json` 里有 `kilo` 服务器 |

---

## English Guide

### Overview

`kilo-channel` is a **Channel MCP server** built on
[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk):

1. Communicates with WorkBuddy (or any compatible MCP client) over **stdio**;
2. Starts a local **HTTP server** that receives Kilo's webhook pushes;
3. On a message, sends a `notifications/claude/channel` notification to WorkBuddy;
4. WorkBuddy's AI reads it and calls the loaded `kilo_*` MCP tools (e.g.
   `kilo_send_message`) to send the reply back to Kilo.

> Note: this server exposes **no MCP tools itself** (tools/list returns empty). It only
> forwards messages. The actual sending capability comes from the Kilo MCP server that
> WorkBuddy has configured.

### How it works

```
Kilo  ──webhook(POST)──▶  kilo-channel(HTTP :8090)
                              │
                              │  notifications/claude/channel (stdio)
                              ▼
                         WorkBuddy (AI)
                              │
                              │  kilo_send_message (MCP)
                              ▼
                            Kilo  ←── auto reply
```

### Prerequisites

Before using this connector, download and install the **Kilo** client first:

👉 https://www.aurora-wave.com/kilo/index.html

After installing and launching Kilo, you can proceed with the webhook and MCP setup below.

### Install

Requires Node.js 18+. Clone and install dependencies:

```bash
git clone https://github.com/yianding/kilo-channel.git
cd kilo-channel
npm install
```

`npm install` pulls in `@modelcontextprotocol/sdk` (see `package.json`).

### Run

```bash
# Option A: directly
node kilo-channel.mjs

# Option B: npm script
npm start
```

On success you'll see logs like:

```
[Kilo Channel] ✅ HTTP 服务器已启动
[Kilo Channel] 📡 监听地址: http://127.0.0.1:8090
[Kilo Channel] 🔗 请在 Kilo 配置中设置:
[Kilo Channel]    webhook_url: http://127.0.0.1:8090
[Kilo Channel] ✅ 已连接到 WorkBuddy via stdio
```

### Environment variables

All settings are optional and fall back to defaults.

| Variable | Description | Default |
|----------|-------------|---------|
| `KILO_CHANNEL_PORT` | HTTP webhook listen port | `8090` |
| `KILO_CHANNEL_CONFIG` | Path to the Kilo config file (for token / url) | `$HOME/.workbuddy/mcp.json` |
| `KILO_MCP_URL` | Kilo MCP server URL (fallback when config is missing) | `http://127.0.0.1:9090/mcp` |

Example — use port 9099 with a custom config path:

```bash
KILO_CHANNEL_PORT=9099 \
KILO_CHANNEL_CONFIG=/path/to/mcp.json \
node kilo-channel.mjs
```

### Register in WorkBuddy

Add the following to WorkBuddy's MCP config (usually `~/.workbuddy/mcp.json`):

```json
{
  "mcpServers": {
    "kilo-channel": {
      "command": "node",
      "args": ["/absolute/path/to/kilo-channel/kilo-channel.mjs"]
    }
  }
}
```

> To have WorkBuddy load it as a channel on startup, run:
> `codebuddy --channels server:kilo-channel`

### Configure Kilo webhook

In Kilo, set the webhook push URL to:

```
http://127.0.0.1:<port>
```

The default port is `8090`, i.e. `http://127.0.0.1:8090`. If you changed it via
`KILO_CHANNEL_PORT`, update this URL accordingly.

### Port conflicts

- Only **one** `kilo-channel` instance may run on a machine (the port is exclusive).
- A second start fails with `EADDRINUSE`; the process prints a hint and exits:

  ```
  [Kilo Channel] ❌ 端口 8090 已被占用，请先关闭占用该端口的进程
  [Kilo Channel]    执行: lsof -ti:8090 | xargs kill -9
  ```

- Find the offender: `lsof -ti:8090 | xargs kill -9` (replace with your port).

### Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Cannot find module '@modelcontextprotocol/sdk'` | deps not installed | run `npm install` in `kilo-channel` |
| `EADDRINUSE` | port taken by another instance | kill the occupant or use `KILO_CHANNEL_PORT` |
| No messages received | wrong Kilo webhook_url / not connected to WorkBuddy | verify webhook URL and WorkBuddy connection |
| Messages received but no reply | WorkBuddy lacks Kilo MCP tools | ensure `kilo` server is in WorkBuddy's `mcp.json` |
