# Telegram 客服机器人

<p align="center">
  <img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers">
  <img src="https://img.shields.io/badge/Telegram-Bot-26A5E4?style=flat-square&logo=telegram&logoColor=white" alt="Telegram Bot">
  <img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="License">
</p>

基于 Cloudflare Workers 的 Telegram 客服机器人，支持纯转发、CAPTCHA 验证、垃圾信息过滤和用户封禁功能。

## ✨ 特性

- 🔄 **纯转发机制** - 用户消息自动转发给管理员，管理员回复转发给用户
- 🔐 **智能验证** - 点击式 CAPTCHA 验证（10-40 随机数加法）
- 🚫 **垃圾过滤** - 关键词检测疑似广告内容
- 🔨 **用户封禁** - 3 次验证失败自动封禁 7 天
- 💾 **KV 存储** - 使用 Cloudflare KV 存储用户数据
- 🆓 **完全免费** - 利用 Cloudflare Workers 免费套餐

## 📸 演示

### 用户端

```
🔐 首次使用需要过个小验证（防广告机器人）

23 + 37 = ?

[ 53 ]  [ 60 ]  [ 71 ]
```

点击正确答案后：

```
✅ 验证成功！你已通过验证，直接发消息吧～
```

### 管理员端

- 自动接收所有用户消息（转发形式）
- 直接回复机器人即可回复用户
- 使用 `/status` 查看最近联系用户

## 🚀 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) 16+
- [Cloudflare 账号](https://dash.cloudflare.com/)
- Telegram 账号

### 1. 创建 Telegram Bot

1. 在 Telegram 搜索 [@BotFather](https://t.me/botfather)
2. 发送 `/newbot` 创建机器人
3. 按提示设置名称和用户名
4. 保存返回的 `BOT_TOKEN`

### 2. 获取管理员 ID

1. 在 Telegram 搜索 [@userinfobot](https://t.me/userinfobot)
2. 发送任意消息获取你的用户 ID
3. 保存这个数字 ID

### 3. 克隆项目

```bash
git clone https://github.com/ghzxs/telegram-feedback-bot.git
cd telegram-feedback-bot
```

### 4. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 5. 登录 Cloudflare

```bash
wrangler login
```

### 6. 创建 KV 命名空间

```bash
# 创建生产环境 KV
wrangler kv:namespace create "BOT_KV"
```

记录返回的 `id`，更新到 `wrangler.toml` 中：

```toml
kv_namespaces = [
  { binding = "BOT_KV", id = "你的KV_ID" }
]
```

### 7. 配置环境变量

创建 `.env` 文件：

```bash
BOT_TOKEN=你的_BOT_TOKEN
ADMIN_ID=你的_Telegram_ID
WEBHOOK_SECRET=随机字符串
```

### 8. 部署

```bash
wrangler deploy
```
Worker 批量上传密钥
```bash
wrangler secret bulk .env
```

### 9. 设置 Webhook

访问以下 URL（替换为你的 Worker URL）：

```
https://你的worker地址/setWebhook
```

看到 `{"ok":true,"result":true}` 即成功。

### 10. 测试

在 Telegram 中找到你的机器人，发送 `/start` 开始使用！

## 📁 项目结构

```
telegram-customer-service-bot/
├── src/
│   └── index.js          # 主要代码
├── wrangler.toml         # Cloudflare Workers 配置
├── .env             # 环境变量（不要提交到 Git）
├── .gitignore            # Git 忽略文件
└── README.md             # 项目说明
```

## 🔧 配置说明

### wrangler.toml

```toml
name = "telegram-customer-service-bot"
main = "src/index.js"
compatibility_date = "2025-11-22"

kv_namespaces = [
  { binding = "BOT_KV", id = "你的KV命名空间ID" }
]
```

### .env

```bash
# Telegram Bot Token (从 @BotFather 获取)
BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz

# 管理员 Telegram ID (从 @userinfobot 获取)
ADMIN_ID=123456789

# Webhook 密钥（可选）
WEBHOOK_SECRET=your_random_secret_key
```

## 📖 使用指南

### 用户操作

1. **首次使用**
   - 发送 `/start` 触发验证
   - 点击正确答案完成 CAPTCHA
   - 验证成功后即可发送消息

2. **发送消息**
   - 直接发送文字消息
   - 消息会自动转发给客服
   - 等待客服回复

3. **注意事项**
   - 错误回答 CAPTCHA 3 次会被封禁 7 天
   - 发送疑似广告内容会被拦截

### 管理员操作

1. **接收消息**
   - 用户消息自动转发到管理员账号
   - 查看完整消息内容和用户信息

2. **回复用户**
   - 直接回复机器人消息
   - 消息会转发给最近联系的用户

3. **查看状态**
   - 发送 `/status` 查看最近联系用户

## 🎨 自定义配置

### 修改 CAPTCHA 难度

在 `src/index.js` 中修改随机数范围：

```javascript
function generateCaptcha() {
  const a = Math.floor(Math.random() * 31) + 10; // 修改范围
  const b = Math.floor(Math.random() * 31) + 10; // 修改范围
  // ...
}
```

### 修改垃圾关键词

在 `src/index.js` 中修改 `SPAM_KEYWORDS` 数组：

```javascript
const SPAM_KEYWORDS = [
  '赚钱', '兼职', '代理', '加微信', '点击链接',
  '你的关键词',
  // 添加更多...
];
```

### 修改封禁时长

修改 `banUser` 函数调用时的天数参数：

```javascript
await banUser(env, userId, 7); // 改为其他天数
```

## 🗄️ KV 数据结构

| Key | Value | TTL | 说明 |
|-----|-------|-----|------|
| `user:{userId}` | `{verified, verifiedAt}` | 永久 | 用户验证状态 |
| `captcha:{userId}` | `{answer, attempts, captchaId}` | 5分钟 | CAPTCHA 数据 |
| `ban:{userId}` | `{until}` | 7天 | 封禁信息 |
| `last_contact` | `{userId, username, timestamp}` | 永久 | 最近联系用户 |

## 🔍 调试和故障排查

### 查看实时日志

```bash
wrangler tail
```

### 检查 Webhook 状态 — 
*(编辑代码HTTP)*

```bash
curl https://你的worker地址/getWebhookInfo
```

### 检查机器人信息

```bash
curl https://你的worker地址/getMe
```

### 重置 Webhook

```bash
# 删除
curl https://你的worker地址/deleteWebhook

# 重新设置
curl https://你的worker地址/setWebhook
```

### 常见问题

**问题：机器人无响应**

解决方案：
1. 检查 webhook 是否设置成功
2. 查看 `wrangler tail` 日志
3. 确认 `.env` 配置正确
4. 重新部署 `wrangler deploy

**问题：环境变量未生效**

解决方案：
1. 确认 `.env` 文件存在
2. 重新部署项目
3. 检查文件格式（无引号、无空格）

**问题：CAPTCHA 无法点击**

解决方案：
1. 清除旧 webhook：访问 `/deleteWebhook`
2. 重新设置：访问 `/setWebhook`
3. 重新部署代码

## 💰 成本说明

**Cloudflare Workers 免费套餐：**

- ✅ 每天 100,000 次请求
- ✅ KV 读取：100,000 次/天
- ✅ KV 写入：1,000 次/天
- ✅ KV 存储：1 GB

对于小型到中型客服机器人完全免费！

## 🚀 高级配置

### 多环境部署

如需开发和生产环境分离，参考 [多环境配置文档](https://developers.cloudflare.com/workers/ci-cd/builds/)

### 自动化部署

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ghzxs/telegram-feedback-bot)

## 📄 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/webhook` | POST | Telegram Webhook 接收端点 |
| `/setWebhook` | GET | 设置 Telegram Webhook |
| `/getWebhookInfo` | GET | 查看 Webhook 信息 |
| `/deleteWebhook` | GET | 删除 Webhook |
| `/getMe` | GET | 获取机器人信息 |

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📝 更新日志

### v1.0.0 (2025-11-22)

- ✨ 初始版本发布
- 🔐 点击式 CAPTCHA 验证
- 🔄 纯转发客服机制
- 🚫 垃圾信息过滤
- 🔨 用户封禁功能

## 📜 开源协议

本项目采用 [MIT](LICENSE) 协议开源。

## 🙏 致谢

- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

## 📧 联系方式

- 项目地址：[GitHub](https://github.com/ghzxs/telegram-customer-service-bot)
- 问题反馈：[Issues](https://github.com/ghzxs/telegram-customer-service-bot/issues)

---
> ## *It all begins with you !*
> ## *这只是一个起点，来源于你！*
<p align="center">
  Made with ❤️ using Cloudflare Workers
</p>