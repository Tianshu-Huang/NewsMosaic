# 📋 快速注册清单

复制此清单，逐个注册。估计总时间: **5 分钟**

---

## ✅ 第 1 步：The Guardian API (1 分钟)

- [ ] 打开: https://open.theguardian.com/documentation/
- [ ] 向下滚动找到 "Register for a free access key"
- [ ] 输入邮箱地址
- [ ] 检查邮箱，点击验证链接
- [ ] 复制你的 API Key
- [ ] **API Key**: `_________________________`

---

## ✅ 第 2 步：NewsData.io (1 分钟)

- [ ] 打开: https://newsdata.io/register
- [ ] 填写注册表单
- [ ] 登录 Dashboard
- [ ] 复制你的 API Key
- [ ] **API Key**: `_________________________`

---

## ✅ 第 3 步 (可选)：Reddit (5 分钟)

- [ ] 确保你有 Reddit 账号 (没有的话先注册：https://reddit.com)
- [ ] 打开: https://www.reddit.com/prefs/apps
- [ ] 点击 "Create App" 或 "Create Another App"
- [ ] 选择 "script" 类型
- [ ] 名称: 例如 "NewsMosaic"
- [ ] 重定向 URI: `http://localhost:8000`
- [ ] 创建应用
- [ ] 复制 **Client ID**: `_________________________`
- [ ] 点击 "edit"，复制 **Secret**: `_________________________`

---

## ✅ 第 4 步：创建 .env 文件

在 `/Users/lilylu/NewsMosaic/news-mosaic/backend/` 创建 `.env` 文件：

```
# 新闻来源 API Keys
NEWS_API_KEY=8eb142ff4a4d4051b532d10cb9d248d1

# The Guardian
GUARDIAN_API_KEY=来自第1步的Key

# NewsData.io
NEWSDATA_API_KEY=来自第2步的Key

# Reddit (可选)
REDDIT_CLIENT_ID=来自第3步的Client ID
REDDIT_CLIENT_SECRET=来自第3步的Secret

# LLM API Key
GEMINI_API_KEY=AIzaSyAuOQ1decEruEhoetCI5d5dzkNzNTAQ084
```

---

## ✅ 第 5 步：重启后端

1. 后端已经在运行，会自动检测 .env 文件
2. 如果没有自动加载，手动重启：
   ```
   Ctrl+C 停止当前后端
   cd /Users/lilylu/NewsMosaic/news-mosaic
   python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
   ```

---

## ✅ 第 6 步：验证

- [ ] 打开 http://localhost:5173
- [ ] 输入查询词
- [ ] 应该看到来自多个来源的新闻

---

## 🎯 记要点

| API | 是否必需 | 是否免费 | 注册时间 |
|-----|--------|--------|--------|
| NewsAPI | ✅ | ✅ | 已配置 |
| HackerNews | ❌ | ✅ | 无需注册 |
| The Guardian | 推荐 | ✅ | 1 分钟 |
| NewsData.io | 推荐 | ✅ | 1 分钟 |
| Reddit | 可选 | ✅ | 5 分钟 |

---

需要帮助? 查看完整指南: `/API_REGISTRATION_GUIDE.md`
