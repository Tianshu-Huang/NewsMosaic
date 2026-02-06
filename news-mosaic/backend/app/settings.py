import os
from dotenv import load_dotenv

load_dotenv()

NEWS_API_KEY = os.getenv("NEWS_API_KEY", "8eb142ff4a4d4051b532d10cb9d248d1")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyAuOQ1decEruEhoetCI5d5dzkNzNTAQ084")
