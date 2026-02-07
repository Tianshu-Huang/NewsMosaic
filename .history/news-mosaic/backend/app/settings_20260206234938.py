import os
from dotenv import load_dotenv

load_dotenv()

# 新闻来源 API Keys
NEWS_API_KEY = os.getenv("NEWS_API_KEY", "8eb142ff4a4d4051b532d10cb9d248d1")
GUARDIAN_API_KEY = os.getenv("GUARDIAN_API_KEY", "")
NEWSDATA_API_KEY = os.getenv("NEWSDATA_API_KEY", "")

# LLM API Key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyAuOQ1decEruEhoetCI5d5dzkNzNTAQ084")

# 新闻源配置
ENABLE_NEWS_API = True
ENABLE_GUARDIAN = bool(GUARDIAN_API_KEY.strip())
ENABLE_NEWSDATA = bool(NEWSDATA_API_KEY.strip())
ENABLE_REDDIT = True  # 使用去中心化 JSON endpoint，无需认证
ENABLE_HACKERNEWS = True  # 不需要 API key，完全免费
