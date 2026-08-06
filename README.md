# kilo-channel

> Kilo Channel MCP connector for AI Agents
> Kilo 的 AI Agent Channel MCP 连接器

把 Kilo 的私聊消息通过本地 webhook 转发给任意支持 MCP 的 AI Agent（如 Claude、CodeBuddy、OpenClaw、Codex、WorkBuddy 等），由 Agent 自动调用 Kilo MCP 工具回复，实现「Kilo 收消息 → Agent 自动回」的闭环。

Forwards Kilo private messages to any MCP-capable AI agent (Claude, CodeBuddy, OpenClaw, Codex, WorkBuddy, …) via a local webhook, where the agent's AI automatically replies using the Kilo MCP tools — closing the loop "Kilo receives → agent replies".

---

## 目录 / Table of Contents

- [中文说明](#中文说明)
  - [什么是 Kilo](#什么是-kilo)
  - [什么是 kilo-channel](#什么是-kilo-channel)
  - [功能简介](#功能简介)
  - [工作原理](#工作原理)
  - [安装](#安装)
  - [获取 Kilo MCP 连接参数（API Key 与端口）](#获取-kilo-mcp-连接参数api-key-与端口)
  - [运行](#运行)
  - [环境变量](#环境变量)
  - [在 AI Agent 中注册](#在-ai-agent-中注册)
  - [配置 Kilo 的 webhook](#配置-kilo-的-webhook)
  - [验证配置是否生效](#验证配置是否生效)
  - [测试 Kilo MCP 是否配置成功](#测试-kilo-mcp-是否配置成功)
  - [端口冲突说明](#端口冲突说明)
  - [常见问题排查](#常见问题排查)
- [English Guide](#english-guide)
  - [What is Kilo](#what-is-kilo)
  - [What is kilo-channel](#what-is-kilo-channel)
  - [Overview](#overview)
  - [How it works](#how-it-works)
  - [Install](#install)
  - [Get Kilo MCP connection params (API key & port)](#get-kilo-mcp-connection-params-api-key--port)
  - [Run](#run)
  - [Environment variables](#environment-variables)
  - [Register in your AI agent](#register-in-your-ai-agent)
  - [Configure Kilo webhook](#configure-kilo-webhook)
  - [Verify it works](#verify-it-works)
  - [Test that the Kilo MCP server is configured](#test-that-the-kilo-mcp-server-is-configured)
  - [Port conflicts](#port-conflicts)
  - [Troubleshooting](#troubleshooting)

---

## 中文说明

### 什么是 Kilo

**Kilo 是一款去中心化的 P2P 即时通讯软件。**

- **界面 / 客户端**：基于 Kotlin Multiplatform Compose 实现，覆盖 Android、iOS、桌面（JVM）多端。
- **后端守护进程**：一个 Go 语言编写的守护进程（`kilo-message`），负责 libp2p 网络、内置 IPFS（Kubo）、Kademlia DHT 好友发现、离线消息存储与端到端加密。
- **两端通信**：客户端与守护进程通过 **localhost gRPC** 通信，使用 Bearer Token + 可选 mTLS 鉴权。
- **核心能力**：1:1 私聊、群组频道（pubsub）、WebRTC 语音/视频通话、P2P/IPFS 文件传输、sing-box VPN 等。

> 下载安装见：https://www.aurora-wave.com/kilo/index.html

### 什么是 kilo-channel

**kilo-channel 是让 AI Agent 通过 MCP 使用 Kilo 的桥接组件。**

Kilo 守护进程自带一个 **Kilo MCP 服务器**，向外提供 `kilo_list_contacts`、`kilo_send_message`、`kilo_read_messages` 等工具——任何支持 MCP 的 AI Agent（如 Claude、CodeBuddy、OpenClaw、Codex、WorkBuddy 等）只要加载这个服务器，就能读写你的 Kilo 账号。

而 kilo-channel 是配套的 **Channel 连接器**：它把 Kilo 收到的私聊消息通过本地 webhook 实时转发给 AI Agent，让 Agent 在「收到消息」的瞬间自动调用 Kilo MCP 工具把回复发回 Kilo，从而形成完整的闭环：

```
Kilo 收消息 → kilo-channel 转发 → AI Agent 调用 Kilo MCP 工具 → 自动回复到 Kilo
```

简单说：**Kilo 是你的通讯软件，kilo-channel + Kilo MCP 让你手里的 AI Agent 能帮你自动收发 Kilo 消息。**

### 功能简介

`kilo-channel` 是一个 **Channel MCP 服务器**（基于 [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)）：

1. 通过 **stdio** 与 AI Agent（如 Claude、CodeBuddy、OpenClaw、Codex、WorkBuddy 等）通信；
2. 在本地启动一个 **HTTP 服务器**，接收 Kilo 推送的 webhook 消息；
3. 收到消息后，向 AI Agent 发送 `notifications/claude/channel` 通知；
4. Agent 的 AI 读取消息，并调用已加载的 `kilo_*` MCP 工具（如
   `kilo_send_message`）把回复发回 Kilo。

> 注意：本服务本身**不提供任何 MCP 工具**（tools/list 返回空列表），它只做消息转发。
> 真正发消息的能力来自 Agent 里已配置的 Kilo MCP 服务器。

### 工作原理

```
Kilo  ──webhook(POST)──▶  kilo-channel(HTTP :8090)
                              │
                              │  notifications/claude/channel (stdio)
                              ▼
                         AI Agent (e.g. Claude / CodeBuddy / OpenClaw / Codex / WorkBuddy)
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

`kilo-channel` 只做消息转发，真正能调用 `kilo_send_message`、`kilo_list_contacts` 等工具的是 Kilo 自带的 **Kilo MCP 服务器**。要让任意 AI Agent（Claude、CodeBuddy、OpenClaw、Codex、WorkBuddy 等）能调用这些工具，需要先把该 MCP 服务器接入你的 Agent，而接入需要两个参数：**API Key** 和 **MCP 端口号**。这两个参数都保存在 Kilo 本地数据目录下的 `backend` 文件夹（默认 `~/.kilo/backend`，Linux 为 `$HOME/.kilo/backend`，Windows 为 `%USERPROFILE%\.kilo\backend`）。

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

3. **配置 Kilo MCP 服务器** —— 在所用 Agent 的 MCP 配置文件（以 WorkBuddy / CodeBuddy 为例，通常为 `~/.workbuddy/mcp.json`；其它 Agent 请参考其 MCP 配置位置）的 `mcpServers` 中加入以下内容，把端口和 key 替换成你上一步读到的值：

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

   配置完成后，Agent 即可通过 `kilo_*` 系列工具操作你的 Kilo 账号，配合 `kilo-channel` 实现「Kilo 收消息 → Agent 自动回」的闭环。

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

### 在 AI Agent 中注册

`kilo-channel` 通过 stdio 接入任意支持 MCP 的 Agent（Claude、CodeBuddy、OpenClaw、Codex、WorkBuddy 等）。下面以 **WorkBuddy / CodeBuddy** 为例（其配置文件通常为 `~/.workbuddy/mcp.json`），其它 Agent 请写入对应的 MCP 配置文件：

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

> 若要让 WorkBuddy / CodeBuddy 在启动时自动把 `kilo-channel` 加载为 channel，请用下面格式启动（以 macOS 为例）：
>
> ```bash
> /Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy --channels server:kilo-channel
> ```
>
> 其它平台把 `codebuddy` 换成你实际的 WorkBuddy / CodeBuddy 可执行文件（CLI）路径即可，参数统一为 `--channels server:kilo-channel`。
> 启动后，Kilo 推送的消息就会经 `kilo-channel` 转发给该 Agent 的 AI 自动处理。
>
> 注：Claude Code、Codex、OpenClaw 等 Agent 同样可加载本连接器（写入各自的 MCP 配置即可），只是各自的注册方式与启动参数不同，请参考对应 Agent 的文档。

### 配置 Kilo 的 webhook

在 Kilo 中把「webhook 推送地址」配置为：

```
http://127.0.0.1:<端口>
```

默认端口为 `8090`，即 `http://127.0.0.1:8090`。如果你通过 `KILO_CHANNEL_PORT`
改了端口，这里也要对应修改。

### 验证配置是否生效

按以下步骤确认整条链路「手机发消息 → 电脑自动回复」跑通：

1. **手机安装并登录 Kilo**：在手机上安装好 Kilo（iOS / Android），并登录你的账号。
2. **手机添加电脑 Kilo 为好友**：在手机端把**电脑上运行的 Kilo** 加为好友（用电脑端 Kilo 的 Solana 地址 / 二维码添加）。
3. **从手机给电脑 Kilo 发消息**：在手机端给「电脑上的 Kilo」这个好友发一条消息。
4. **观察电脑端是否自动回复**：看运行 AI Agent（如 Claude、CodeBuddy、OpenClaw、Codex、WorkBuddy 等）的电脑上，AI 是否通过 `kilo-channel` 收到这条消息并自动用 `kilo_send_message` 回复发回手机。

   - ✅ **收到并回复**：说明 `kilo-channel` 转发、Agent 加载 `kilo` MCP 工具、Kilo webhook 全部正常，闭环成功。
   - ❌ **没收到 / 没回复**：大概率是 AI 没意识到要用 Kilo 工具回消息。此时**在手机发送的消息里直接告诉 AI**，例如：
     > 「请用 kilo mcp 回复这条消息」
     
     这样 AI 会明确调用 `kilo_*` 工具（如 `kilo_send_message`）把内容发回你的手机。

> 提示：Claude、CodeBuddy、OpenClaw、Codex 等 CLI 助手，只有在会话里加载了 `kilo` MCP 服务器（见上文
> 「获取 Kilo MCP 连接参数」）才会具备 `kilo_*` 工具。若没加载，请先按前文配置好再测试。

### 测试 Kilo MCP 是否配置成功

上面验证的是「转发 + 自动回复」整条链路。如果你只想单独确认 **`kilo` MCP 服务器本身是否已正确接入**（即 AI 是否真的拿到了 `kilo_*` 工具），可以用下面这条指令测试：

在加载了 `kilo` MCP 的会话里，直接对 AI 说：

> 「请用 kilo mcp 查看一下我的好友列表，并且给每一个好友发送打招呼的消息」

判断结果：

- ✅ **AI 成功列出好友并发出了打招呼消息** —— 说明 `kilo` MCP 服务器配置正确，`kilo_list_contacts` 与 `kilo_send_message` 等工具都可用，配置成功。
- ❌ **AI 说找不到 kilo 相关工具 / 无法调用** —— 说明 `kilo` MCP 服务器没加载或鉴权失败。请回头检查「获取 Kilo MCP 连接参数」一节：`mcp_port` 是否填对、`Authorization` 的 Bearer Token（API Key）是否有效、配置后是否重启了对应 Agent（如 Claude、CodeBuddy、OpenClaw、Codex、WorkBuddy 等）让新配置生效。

> 这条测试不依赖手机，只要电脑上的 Kilo 正在运行、且 `kilo` MCP 已接入，就能独立验证。

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
| 收不到消息 | Kilo 的 webhook_url 不对 / 未连上 Agent | 核对 webhook 地址与所用 Agent 是否连接 |
| 能收到消息但不回复 | Agent 未加载 Kilo MCP 工具 | 确认所用 Agent 的 MCP 配置里有 `kilo` 服务器 |

---

## English Guide

### What is Kilo

**Kilo is a decentralized, peer-to-peer instant messenger.**

- **UI / client**: built with Kotlin Multiplatform Compose, running on Android, iOS, and Desktop (JVM).
- **Backend daemon**: a Go daemon (`kilo-message`) that handles the libp2p network, embedded IPFS (Kubo),
  Kademlia DHT friend discovery, offline message storage, and end-to-end encryption.
- **Client ↔ daemon**: the client talks to the daemon over **localhost gRPC**, authenticated with a Bearer
  token (+ optional mTLS).
- **Core features**: 1:1 private chat, group channels (pubsub), WebRTC voice/video calls, P2P/IPFS file
  transfer, sing-box VPN, and more.

> Download & install: https://www.aurora-wave.com/kilo/index.html

### What is kilo-channel

**kilo-channel is the bridge that lets an AI agent use Kilo through MCP.**

Kilo's daemon ships a built-in **Kilo MCP server**, exposing tools like `kilo_list_contacts`,
`kilo_send_message`, and `kilo_read_messages`. Any MCP-capable AI agent (Claude, CodeBuddy, OpenClaw,
Codex, WorkBuddy, …) that loads this server can read and write your Kilo account.

kilo-channel is the companion **Channel connector**: it forwards private messages Kilo receives to the AI
agent over a local webhook, so the agent can, the moment it gets a message, call the Kilo MCP tools to send
the reply back — closing the full loop:

```
Kilo receives → kilo-channel forwards → AI agent calls Kilo MCP tools → auto-reply to Kilo
```

In short: **Kilo is your messaging app; kilo-channel + the Kilo MCP server let the AI agent in your hands
automatically send and receive your Kilo messages.**

### Overview

`kilo-channel` is a **Channel MCP server** built on
[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk):

1. Communicates with an AI agent (Claude, CodeBuddy, OpenClaw, Codex, WorkBuddy, …) over **stdio**;
2. Starts a local **HTTP server** that receives Kilo's webhook pushes;
3. On a message, sends a `notifications/claude/channel` notification to the agent;
4. The agent's AI reads it and calls the loaded `kilo_*` MCP tools (e.g.
   `kilo_send_message`) to send the reply back to Kilo.

> Note: this server exposes **no MCP tools itself** (tools/list returns empty). It only
> forwards messages. The actual sending capability comes from the Kilo MCP server that the
> agent has configured.

### How it works

```
Kilo  ──webhook(POST)──▶  kilo-channel(HTTP :8090)
                              │
                              │  notifications/claude/channel (stdio)
                              ▼
                         AI Agent (e.g. Claude / CodeBuddy / OpenClaw / Codex / WorkBuddy)
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
tools come from Kilo's built-in **Kilo MCP server**. To let any AI agent (Claude, CodeBuddy, OpenClaw,
Codex, WorkBuddy, …) call those tools you must
first connect that MCP server to your agent, which requires two parameters: the **API key** and the
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

3. **Configure the Kilo MCP server** — add the following to the `mcpServers` block of your agent's
   MCP config (for WorkBuddy / CodeBuddy, usually `~/.workbuddy/mcp.json`; other agents use their own
   config path), replacing the port and key with your values:

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

   Once configured, your agent can drive your Kilo account via the `kilo_*` tools, and together with
   `kilo-channel` closes the loop "Kilo receives → agent replies".

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

### Register in your AI agent

`kilo-channel` connects to any MCP-capable agent (Claude, CodeBuddy, OpenClaw, Codex, WorkBuddy, …) over
stdio. Below is the **WorkBuddy / CodeBuddy** example (config usually `~/.workbuddy/mcp.json`); for other
agents, write it into that agent's own MCP config file:

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

> To have WorkBuddy / CodeBuddy load it as a channel on startup, launch with this format (macOS example):
>
> ```bash
> /Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy --channels server:kilo-channel
> ```
>
> On other platforms, replace `codebuddy` with your actual WorkBuddy / CodeBuddy CLI executable path —
> the flag is always `--channels server:kilo-channel`. Once started, Kilo's pushed messages are forwarded
> via `kilo-channel` to that agent's AI for automatic handling.
>
> Note: Claude Code, Codex, OpenClaw, and other agents can load this connector too (just write it into
> their respective MCP config). Their registration and launch flags differ — see each agent's docs.

### Configure Kilo webhook

In Kilo, set the webhook push URL to:

```
http://127.0.0.1:<port>
```

The default port is `8090`, i.e. `http://127.0.0.1:8090`. If you changed it via
`KILO_CHANNEL_PORT`, update this URL accordingly.

### Verify it works

Confirm the full loop "phone sends → computer auto-replies" with these steps:

1. **Install & sign in on phone**: install Kilo on your phone (iOS / Android) and sign in.
2. **Add the computer's Kilo as a friend**: on the phone, add the **Kilo running on your computer**
   as a friend (use the computer Kilo's Solana address / QR code).
3. **Send a message from phone to computer Kilo**: on the phone, send a message to that "computer
   Kilo" friend.
4. **Watch the computer auto-reply**: on the computer running your AI agent (Claude, CodeBuddy, OpenClaw, Codex, WorkBuddy, …), check whether
   the AI received the message via `kilo-channel` and automatically replied using
   `kilo_send_message` back to the phone.

   - ✅ **Received & replied** — `kilo-channel` forwarding, the agent's `kilo` MCP tools, and the
     Kilo webhook are all working; the loop is closed.
   - ❌ **No reply / not received** — most likely the AI didn't realize it should reply via Kilo.
     In that case, **tell the AI explicitly in the message you send from the phone**, e.g.:
     > "Please reply to this message using the kilo mcp"
     
     The AI will then call the `kilo_*` tools (e.g. `kilo_send_message`) to send the content back
     to your phone.

> Tip: CLI assistants like Claude, CodeBuddy, OpenClaw, Codex only gain the `kilo_*` tools when the `kilo` MCP
> server is loaded in the session (see "Get Kilo MCP connection params" above). If it isn't loaded,
> configure it first, then test again.

### Test that the Kilo MCP server is configured

The steps above verify the whole "forwarding + auto-reply" loop. If you only want to confirm that
the **`kilo` MCP server itself is correctly connected** (i.e. the AI actually has the `kilo_*` tools),
use this test instruction:

In a session where the `kilo` MCP is loaded, simply tell the AI:

> "Please use the kilo mcp to view my friend list, and send a greeting message to every friend."

How to read the result:

- ✅ **The AI lists your friends and sends the greetings** — the `kilo` MCP server is configured
  correctly; `kilo_list_contacts`, `kilo_send_message`, etc. are all available. Success.
- ❌ **The AI says it can't find the kilo tools / can't call them** — the `kilo` MCP server isn't
  loaded or auth failed. Re-check "Get Kilo MCP connection params": is `mcp_port` correct, is the
  Bearer token (API key) valid, and did you restart your agent (Claude, CodeBuddy, OpenClaw, Codex,
  WorkBuddy, …) so the new config takes
  effect?

> This test doesn't need a phone — as long as Kilo is running on the computer and the `kilo` MCP is
> connected, it verifies the setup on its own.

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
| No messages received | wrong Kilo webhook_url / not connected to agent | verify webhook URL and agent connection |
| Messages received but no reply | agent lacks Kilo MCP tools | ensure `kilo` server is in the agent's MCP config |
