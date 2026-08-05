# kilo-channel

Kilo Channel MCP connector for WorkBuddy. 作为 MCP 服务器通过 stdio 与 WorkBuddy
通信，并监听本地 HTTP 端口接收 Kilo 的 webhook 推送，转发给 WorkBuddy 自动回复。

## 安装

```bash
npm install
```

## 运行

```bash
node kilo-channel.mjs
# 或
npm start
```

## 环境变量（均可选）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `KILO_CHANNEL_PORT` | 监听端口 | `8090` |
| `KILO_CHANNEL_CONFIG` | Kilo 配置文件路径 | `$HOME/.workbuddy/mcp.json` |
| `KILO_MCP_URL` | Kilo MCP 服务地址 | `http://127.0.0.1:9090/mcp` |

## 在 WorkBuddy 中注册

在 `mcp.json` 中加入：

```json
"kilo-channel": {
  "command": "node",
  "args": ["/绝对路径/kilo-channel.mjs"]
}
```

并在 Kilo 中把 `webhook_url` 配置为 `http://127.0.0.1:<端口>`（默认 8090）。

> 注意：同一台机器上只能运行一个实例（端口唯一），重复启动会 `EADDRINUSE`。
