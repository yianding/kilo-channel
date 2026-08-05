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
  - [获取 Kilo MCP 连接参数（API Key 与端口）](#获取-kilo-mcp-连接参数api-key-与端口)
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
  - [Get Kilo MCP connection params (API key & port)](#get-kilo-mcp-connection-params-api-key--port)
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

### 获取 Kilo MCP 连接参数（API Key 与端口）

`kilo-channel` 只做消息转发，真正能调用 `kilo_send_message`、`kilo_list_contacts` 等工具的是 Kilo 自带的 **Kilo MCP 服务器**。要让 WorkBuddy 能调用这些工具，需要先把该 MCP 服务器接入 WorkBuddy，而接入需要两个参数：**API Key** 和 **MCP 端口号**。这两个参数都保存在 Kilo 本地数据目录下的 `backend` 文件夹（默认 `~/.kilo/backend`，Linux 为 `$HOME/.kilo/backend`，Windows 为 `%USERPROFILE%\.kilo\backend`）。

1. **读取 MCP 端口号** —— 打开 `~/.kilo/backend/config.json`，取其中的 `mcp_port` 字段：

   ```json
   {
     "mcp_port": 39179
     // ... 其它字段省略
   }
   ```

   这里的 `39179` 就是 Kilo MCP 服务监听的端口（每台机器可能不同，请以你本地文件为准）。

   > ⚠️ **注意：`config.json` 不是严格的 JSON 文件**。它开头带有 `//` 注释行，直接交给
   > `JSON.parse` / `json.load` 会报错（`Expecting value: line 1 column 1`）。若用程序/AI 读取，
   > 请先去掉 `//` 注释，或用下面这条命令可靠地取出端口号：
   >
   > ```bash
   > grep -o '"mcp_port"[[:space:]]*:[[:space:]]*[0-9]*' ~/.kilo/backend/config.json | grep -o '[0-9]*'
   > ```

2. **读取 API Key** —— 打开 `~/.kilo/backend/.api_key.json`，它是一个数组，取其中对象的 `key` 字段：

   ```json
   [
     {
       "name": "Kilo",
       "remark": "autogen",
       "expiry": "2100-01-01T00:00:00Z",
       "key": "<你的 API Key>"
     }
   ]
   ```

   把 `key` 的值作为后续配置里的 Bearer Token 使用（注意 `.api_key.json` 是隐藏文件，需开启「显示隐藏文件」才能看到）。

3. **配置 Kilo MCP 服务器** —— 在 WorkBuddy 的 MCP 配置文件（通常为 `~/.workbuddy/mcp.json`）的 `mcpServers` 中加入以下内容，把端口和 key 替换成你上一步读到的值：

   ```json
   {
     "mcpServers": {
       "kilo": {
         "type": "http",
         "url": "http://127.0.0.1:39179/",
         "headers": {
           "Authorization": "Bearer <你的 API Key>"
         },
         "disabled": false
       }
     }
   }
   ```

   配置完成后，WorkBuddy 即可通过 `kilo_*` 系列工具操作你的 Kilo 账号，配合 `kilo-channel` 实现「Kilo 收消息 → WorkBuddy 自动回」的闭环。

> 提示：`~/.kilo` 是 Kilo 的默认数据目录。若你安装时修改过数据目录，请在对应的实际目录下寻找 `config.json` 与 `.api_key.json`。

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

> 若要让 WorkBuddy 在启动时自动加载为 channel，请用下面格式启动（以 macOS 为例）：
>
> ```bash
> /Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy --channels server:kilo-channel
> ```
>
> 其它平台把 `codebuddy` 换成你实际的 WorkBuddy 可执行文件（CLI）路径即可，参数统一为 `--channels server:kilo-channel`。
> 启动后，Kilo 推送的消息就会经 `kilo-channel` 转发给 WorkBuddy 的 AI 自动处理。

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

### Get Kilo MCP connection params (API key & port)

`kilo-channel` only forwards messages. The actual `kilo_send_message`, `kilo_list_contacts`, etc.
tools come from Kilo's built-in **Kilo MCP server**. To let WorkBuddy call those tools you must
first connect that MCP server to WorkBuddy, which requires two parameters: the **API key** and the
**MCP port number**. Both live in Kilo's local data directory under the `backend` folder
(default `~/.kilo/backend` on macOS/Linux, `%USERPROFILE%\.kilo\backend` on Windows).

1. **Read the MCP port** — open `~/.kilo/backend/config.json` and take the `mcp_port` field:

   ```json
   {
     "mcp_port": 39179
     // ... other fields omitted
   }
   ```

   `39179` is the port Kilo's MCP server listens on (it differs per machine — use your local value).

   > ⚠️ **Note: `config.json` is NOT strict JSON.** It begins with `//` comment lines, so passing it
   > to `JSON.parse` / `json.load` throws (`Expecting value: line 1 column 1`). If a program/AI reads
   > it, strip the `//` comments first, or use this command to extract the port reliably:
   >
   > ```bash
   > grep -o '"mcp_port"[[:space:]]*:[[:space:]]*[0-9]*' ~/.kilo/backend/config.json | grep -o '[0-9]*'
   > ```

2. **Read the API key** — open `~/.kilo/backend/.api_key.json`, an array; take the `key` field of
   an object:

   ```json
   [
     {
       "name": "Kilo",
       "remark": "autogen",
       "expiry": "2100-01-01T00:00:00Z",
       "key": "<your API key>"
     }
   ]
   ```

   Use the `key` value as the Bearer token in the next step (`.api_key.json` is a hidden file —
   enable "show hidden files" to see it).

3. **Configure the Kilo MCP server** — add the following to the `mcpServers` block of WorkBuddy's
   MCP config (usually `~/.workbuddy/mcp.json`), replacing the port and key with your values:

   ```json
   {
     "mcpServers": {
       "kilo": {
         "type": "http",
         "url": "http://127.0.0.1:39179/",
         "headers": {
           "Authorization": "Bearer <your API key>"
         },
         "disabled": false
       }
     }
   }
   ```

   Once configured, WorkBuddy can drive your Kilo account via the `kilo_*` tools, and together with
   `kilo-channel` closes the loop "Kilo receives → WorkBuddy replies".

> Tip: `~/.kilo` is Kilo's default data directory. If you changed it at install time, look for
> `config.json` and `.api_key.json` in your actual data directory instead.

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

> To have WorkBuddy load it as a channel on startup, launch it with this format (macOS example):
>
> ```bash
> /Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy --channels server:kilo-channel
> ```
>
> On other platforms, replace `codebuddy` with your actual WorkBuddy CLI executable path — the flag
> is always `--channels server:kilo-channel`. Once started, Kilo's pushed messages are forwarded via
> `kilo-channel` to WorkBuddy's AI for automatic handling.

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
