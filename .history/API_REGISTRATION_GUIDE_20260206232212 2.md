# 📖 新闻来源 API 注册指南

完整的多源新闻集成已经实现！现在你需要获取一些 API Keys。本指南会一步步告诉你如何操作。

---

## 📋 快速总结

| 来源 | 注册需求 | 时间 | 优先级 |
|------|---------|------|--------|
| **NewsAPI** | ✅ 已有默认 Key | - | 已配置 |
| **HackerNews** | ❌ 无需注册 | - | 自动启用 |
| **The Guardian** | ✅ 1 分钟注册 | 1 分钟 | ⭐⭐⭐ |
| **NewsData.io** | ✅ 1 分钟注册 | 1 分钟 | ⭐⭐⭐ |
| **Reddit** | ✅ 可选 (已有账号) | 5 分钟 | ⭐⭐ |

---

## 🔐 第一步: The Guardian API

### 步骤
1. 打开 https://open.theguardian.com/documentation/
2. 向下滚动，找到 **"Register for a free access key"**
3. 填写邮箱地址
4. 检查邮箱，点击验证链接
5. 你的 API Key 会显示在页面上

### 获取 Key 后
复制你的 API Key，粘贴到这里（替换 `.env` 文件中的值）：
```python
GUARDIAN_API_KEY=your_key_here
```

---

## 🔐 第二步: NewsData.io API

### 步骤
1. 打开 https://newsdata.io/register
2. 填写注册表单:
   - 邮箱
   - 密码
   - 确认密码
3. 点击 **"Sign up"**
4. 登录到你的 Dashboard
5. 在 Dashboard 中，你会看到 **"API Key"** 部分

### 获取 Key 后
复制你的 API Key，粘贴到这里：
```python
NEWSDATA_API_KEY=your_key_here
```

---

## 🔐 第三步 (可选): Reddit API

### 前置条件
- 需要一个 Reddit 账号 (如果没有，先注册一个，地址: https://reddit.com)

### 步骤
1. 登录你的 Reddit 账号
2. 打开 https://www.reddit.com/prefs/apps
3. 向下滚动到 **"developed applications"** 部分
4. 点击 **"Create App"** 或 **"Create Another App"**
5. 填写表单:
   - **Name**: 例如 "NewsMosaic" 或任何你喜欢的名字
   - **App type**: 选择 **"script"**
   - **Redirect URI**: 输入 `http://localhost:8000` (或任何本地地址)
6. 点击 **"Create App"**
7. 你会看到你的应用信息:
   - **Client ID**: 在应用名称下的一串文字
   - **Secret**: 点击 **"edit"** 按钮后可以看到

### 获取 Keys 后
```python
REDDIT_CLIENT_ID=your_client_id_here
REDDIT_CLIENT_SECRET=your_client_secret_here
```

---

## 📝 如何更新 .env 文件

1. 在后端目录中找到或创建 `.env` 文件：
   ```
   /Users/lilylu/NewsMosaic/news-mosaic/backend/.env
   ```

2. 复制 `.env.example` 中的所有内容到 `.env`

3. 替换以下几行（用你从上面获取的 API Keys）：
   ```
   GUARDIAN_API_KEY=your_key_here
   NEWSDATA_API_KEY=your_key_here
   REDDIT_CLIENT_ID=your_client_id_here (可选)
   REDDIT_CLIENT_SECRET=your_client_secret_here (可选)
   ```

4. 保存文件

5. 重启后端服务：
   - 在后端运行的终端中按 `Ctrl+C` 停止
   - 运行：`cd /Users/lilylu/NewsMosaic/news-mosaic && python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000`

---

## ✅ 验证配置

配置完成后，你可以在 Swagger UI 中测试：

1. 打开 http://localhost:8000/docs
2. 找到 `POST /mosaic` 端点
3. 点击 **"Try it out"**
4. 输入查询词，例如 "artificial intelligence"
5. 点击 **"Execute"**
6. 查看响应中的文章来源，应该包含多个来源的数据

---

## 📊 预期效果

配置完全后，你应该能从以下来源获取新闻：

- ✅ **NewsAPI** - 高质量新闻源聚合
- ✅ **The Guardian** - 英国顶级媒体
- ✅ **NewsData.io** - 全球各地新闻
- ✅ **HackerNews** - 科技社区讨论
- ✅ **Reddit** (可选) - 社交讨论和观点

---

## 🐛 故障排除

### 问题: "为什么没有看到某个来源的数据？"

**原因**: API Key 没有配置或配置错误

**解决方案**:
1. 检查 `.env` 文件中的 API Key 是否正确复制
2. 检查后端日志，会显示错误信息
3. 确保后端已重启

### 问题: "如何禁用某个数据源？"

**解决方案**: 编辑 `.env` 文件，留空或删除相应的 API Key 即可

---

## 💡 额外提示

- **NewsAPI**: 已经有默认 key，可以直接使用，后续可以注册账号替换为自己的 key
- **Gemini API**: 已经有默认 key，用于文章分类和总结
- **免费限额**: 大多数 API 都有免费配额，足以用于开发和个人使用
- **并发获取**: 代码会并发从所有来源获取数据，速度很快

---

需要帮助? 查看代码中的注释或日志输出！
