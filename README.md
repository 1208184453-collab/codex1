# Web Login + OpenAI 问答

这是一个无前端框架、无 npm 依赖的小型网页示例，流程对应：

1. 用户网页登录
2. 用户输入问题
3. 后端服务器接收请求
4. 后端调用 OpenAI Responses API
5. GPT 生成答案
6. 答案返回网页显示

## 配置

项目根目录已经有 `.env`。你可以直接编辑它，也可以运行脚本写入 key。

如果 PowerShell 禁止运行 `.ps1`，用这个：

```cmd
set-openai-key.cmd
```

也可以用 PowerShell 版本：

```powershell
.\set-openai-key.ps1
```

`.env` 内容示例：

```env
APP_USERNAME=demo
APP_PASSWORD=demo123
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-5.4-mini
OPENAI_PROXY_URL=http://127.0.0.1:7890
PORT=3000
```

## 启动

PowerShell：

```powershell
.\run.ps1
```

如果 PowerShell 禁止运行脚本，用这个：

```cmd
run.cmd
```

然后打开：

```text
http://localhost:3000
```

## 文件结构

```text
server.js          后端服务器、登录会话、OpenAI API 转发
public/index.html  网页结构
public/styles.css  页面样式
public/app.js      登录、提问、显示答案的前端逻辑
run.ps1            启动脚本
```

## 说明

当前登录逻辑适合本地演示。真正上线时建议改成数据库用户表、密码哈希、HTTPS、请求频率限制和更完整的日志审计。
