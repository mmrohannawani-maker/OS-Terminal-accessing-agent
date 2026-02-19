from langchain_tavily import TavilySearch
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("TAVILY_API_KEY")
if not api_key:
    print("❌ TAVILY_API_KEY not found")
    exit(1)

print(f"✅ API key found (length: {len(api_key)})")

tool = TavilySearch(max_results=2, include_answer=True)
result = tool.invoke({"query": "latest news about artificial intelligence"})

print("\n🔍 SEARCH RESULT:")
print(result)