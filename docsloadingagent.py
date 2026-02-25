"""
Browser Research Agent with WebBaseLoader - HTTP Version
===========================================
This agent:
1. Takes user query
2. Uses Tavily to get 2-3 relevant links
3. Loads those links using WebBaseLoader
4. LLM summarizes the loaded content with source citations

Now uses HTTP instead of WebSocket for better compatibility
"""

# =====================================================
# IMPORTS
# =====================================================
import os
import json
import time
import uuid
from typing import List, Dict, Any, Optional
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_tool_call, AgentMiddleware
from langchain.tools import tool
from langchain_huggingface import HuggingFaceEndpoint, ChatHuggingFace
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from langchain_core.tools import BaseTool
from dotenv import load_dotenv
# =====================================================
# ✅ NEW: Import PostgreSQL memory
# =====================================================
from memory_postgres import PostgresMemory
# =====================================================

# =====================================================
# NEW IMPORTS: WebBaseLoader and Tavily
# =====================================================
import requests
from langchain_community.document_loaders import WebBaseLoader
from bs4 import BeautifulSoup

# Load environment variables
load_dotenv()

# =====================================================
# DEBUG SETUP
# =====================================================
DEBUG = True

def debug_print(component: str, message: str, data: Any = None):
    """Print debug messages with timestamps"""
    if DEBUG:
        timestamp = time.strftime("%H:%M:%S")
        print(f"\n[🔍 DEBUG][{timestamp}] {component}: {message}")
        if data:
            print(f"   Data: {data}")

# =====================================================
# CONFIGURATION
# =====================================================
HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACEHUB_API_TOKEN")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

if not HUGGINGFACE_API_KEY:
    raise ValueError("❌ HUGGINGFACEHUB_API_TOKEN not found in .env file")
if not TAVILY_API_KEY:
    raise ValueError("❌ TAVILY_API_KEY not found in .env file")

debug_print("CONFIG", "API keys loaded successfully")

# =====================================================
# ✅ NEW: Global memory instance
# =====================================================
try:
    memory = PostgresMemory()
    debug_print("MEMORY", "PostgreSQL memory initialized for browser agent")
except Exception as e:
    debug_print("MEMORY", f"Failed to initialize memory: {e}")
    memory = None
# =====================================================

# =====================================================
# ✅ FIX: Pre-initialize agent at module load
# This prevents timeout issues on Railway
# =====================================================

# =====================================================

# =====================================================
# TAVILY SEARCH CLIENT
# =====================================================
class TavilySearchClient:
    """Client for Tavily Search API"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.tavily.com/search"
        debug_print("TAVILY", f"Initialized with API key: {api_key[:5]}...")
    
    def search(self, query: str, max_results: int = 3) -> List[Dict[str, Any]]:
        """Search and return results with URLs"""
        debug_print("TAVILY", f"Searching for: '{query}'")
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        payload = {
            "query": query,
            "search_depth": "advanced",
            "max_results": max_results,
            "include_answer": False
        }
        
        try:
            response = requests.post(self.base_url, headers=headers, json=payload, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            results = data.get("results", [])
            debug_print("TAVILY", f"Found {len(results)} results")
            
            formatted = []
            for i, r in enumerate(results):
                formatted.append({
                    "url": r.get("url", ""),
                    "title": r.get("title", ""),
                    "content": r.get("content", "")
                })
                debug_print("TAVILY", f"Result {i+1}: {r.get('title')} - {r.get('url')}")
            
            return formatted
            
        except Exception as e:
            debug_print("TAVILY", f"Search failed: {e}")
            return []

# =====================================================
# SINGLE TOOL: research_and_summarize
# =====================================================
@tool(
    "research_and_summarize",
    description="Search the web for information about a query, load the content from found URLs, and provide summaries with source citations.",
    response_format="content_and_artifact"  # ← ADD THIS
)
def research_and_summarize(query: str, max_links: int = 3) -> tuple:
    """
    Research a topic by:
    1. Finding relevant links via Tavily search
    2. Loading each link's content using WebBaseLoader
    3. Returning combined content with source tracking
    """
    debug_print("TOOL", f"🔍 research_and_summarize called with query: '{query}'")
    debug_print("TOOL", f"Max links: {max_links}")
    
    # =================================================
    # STEP 1: Search for links using Tavily
    # =================================================
    debug_print("TOOL", "Step 1: Searching for links...")
    tavily = TavilySearchClient(TAVILY_API_KEY)
    search_results = tavily.search(query, max_results=max_links)
    
    if not search_results:
        debug_print("TOOL", "❌ No search results found")
        return f"No results found for '{query}'. Please try a different query."
    
    debug_print("TOOL", f"✅ Found {len(search_results)} results")
    
    # =================================================
    # STEP 2: Load each URL using WebBaseLoader
    # =================================================
    debug_print("TOOL", "Step 2: Loading content from URLs...")
    
    all_content = []
    sources = []
    
    for i, result in enumerate(search_results, 1):
        url = result['url']
        title = result['title']
        
        debug_print("TOOL", f"\n📄 Processing source {i}/{len(search_results)}:")
        debug_print("TOOL", f"   URL: {url}")
        debug_print("TOOL", f"   Title: {title}")
        
        try:
            loader = WebBaseLoader(url)
            loader.requests_kwargs = {'verify': False}
            
            debug_print("TOOL", f"   Loading content...")
            docs = loader.load()
            
            if docs and len(docs) > 0:
                doc = docs[0]
                page_content = doc.page_content if hasattr(doc, 'page_content') else str(doc)
                metadata = doc.metadata if hasattr(doc, 'metadata') else {}
                page_content = ' '.join(page_content.split())[:2000]
                
                debug_print("TOOL", f"   ✅ Loaded {len(page_content)} chars")
                debug_print("TOOL", f"   Metadata: {metadata}")
                
                source_info = {
                    'index': i,
                    'url': url,
                    'title': title,
                    'content': page_content,
                    'metadata': metadata
                }
                all_content.append(source_info)
                sources.append(f"[{i}] {title} - {url}")
            else:
                debug_print("TOOL", f"   ⚠️ No content loaded from {url}")
                
        except Exception as e:
            debug_print("TOOL", f"   ❌ Error loading {url}: {str(e)}")
            continue
    
    if not all_content:
        debug_print("TOOL", "❌ Failed to load content from any source")
        return "Found links but could not load content from any source."
    
    # =================================================
    # STEP 3: Format the combined content for LLM
    # =================================================
    debug_print("TOOL", "Step 3: Formatting combined content...")
    
    formatted_output = f"📚 RESEARCH RESULTS FOR: '{query}'\n"
    formatted_output += "="*60 + "\n\n"
    formatted_output += "🔗 SOURCES FOUND:\n"
    for source in sources:
        formatted_output += f"   {source}\n"
    formatted_output += "\n"
    
    # for content in all_content:
    #     formatted_output += f"\n{'─'*60}\n"
    #     formatted_output += f"📄 SOURCE [{content['index']}]: {content['title']}\n"
    #     formatted_output += f"🔗 URL: {content['url']}\n"
    #     formatted_output += f"{'─'*60}\n"
    #     formatted_output += f"{content['content']}\n\n"
    
    debug_print("TOOL", f"✅ Formatted output: {len(formatted_output)} chars")
    
    sources_dict = {str(i): source['url'] for i, source in enumerate(all_content, 1)}
    
    return formatted_output, sources_dict

# =====================================================
# MIDDLEWARE: Track Sources
# =====================================================
@wrap_tool_call
def track_sources_middleware(tool_call, handler):
    """Middleware that ensures the LLM knows which content comes from which source"""
    tool_name = tool_call.name if hasattr(tool_call, 'name') else str(tool_call)
    debug_print("MIDDLEWARE", f"Intercepting tool: {tool_name}")
    
    result = handler(tool_call)
    
    if tool_name == "research_and_summarize" and isinstance(result, str):
        debug_print("MIDDLEWARE", "Adding source tracking metadata")
        result += "\n\n📌 INSTRUCTION: When answering, cite sources using [1], [2], etc. corresponding to the sources listed above."
    
    return result

# =====================================================
# LLM SETUP
# =====================================================
def setup_llm():
    """Initialize and return the LLM"""
    debug_print("LLM", "Setting up HuggingFace endpoint...")
    
    endpoint = HuggingFaceEndpoint(
        repo_id="deepseek-ai/DeepSeek-V3",
        task="text-generation",
        temperature=0.1,
        max_new_tokens=1500,
        huggingfacehub_api_token=HUGGINGFACE_API_KEY
    )
    
    llm = ChatHuggingFace(llm=endpoint)
    debug_print("LLM", "✅ LLM setup complete")
    
    return llm

# =====================================================
# SYSTEM PROMPT
# =====================================================
SYSTEM_PROMPT = """You are a Research Assistant AI with access to web search and content loading.

YOUR CAPABILITIES:
- You have ONE tool called "research_and_summarize"
- This tool searches the web, loads content from URLs, and returns the content with source information

HOW TO USE THE TOOL:
1. When given a user query, ALWAYS call research_and_summarize first
2. The tool will return content from multiple sources with clear [1], [2], etc. markers
3. Analyze the provided content and create a comprehensive answer
4. Cite your sources using the markers (e.g., "According to [1], AWS is...")

IMPORTANT RULES:
- NEVER answer based on your own knowledge - always use the tool
- When citing, be specific about which part comes from which source
- If a source doesn't contain relevant information, you can mention that
- If no sources are found, inform the user

OUTPUT FORMAT - STRICT RULES:
- Start with a brief overview
- Present findings with inline citations [1], [2]
- DO NOT add a separate "Sources:" section at the end




STRICT RULES:
- DO NOT add any text after the Sources section
- DO NOT add conclusions, summaries, or "For deeper insights" sentences
- DO NOT repeat URLs anywhere else in the response
- The Sources section MUST be the LAST thing in your response
- Absolutely NO text after the Sources section

Example of correct format:
"Based on my research about AWS [1][2], here's what I found:
- AWS provides cloud computing services [1]
- It was launched in 2006 [2]

Sources:
[1] Why Choose AWS? - https://aws.amazon.com/what-is-aws/
[2] Amazon Web Services - https://en.wikipedia.org/wiki/Amazon_Web_Services"

Let's begin!
"""

# =====================================================
# CREATE THE AGENT
# =====================================================
def create_research_agent():
    """Create and return the research agent"""
    debug_print("AGENT", "🚀 Creating research agent...")
    
    llm = setup_llm()
    tools = [research_and_summarize]
    middleware = [track_sources_middleware]
    
    debug_print("AGENT", f"Tools created: {[t.name for t in tools]}")
    debug_print("AGENT", f"Middleware created: {len(middleware)} middleware")
    
    agent = create_agent(
        model=llm,
        tools=tools,
        system_prompt=SYSTEM_PROMPT,
        middleware=middleware,
        debug=True,
        name="research_agent"
    )
    
    debug_print("AGENT", f"✅ Agent created: {type(agent)}")
    
    return agent

# =====================================================
# 🔁 REPLACED: HTTP handler instead of WebSocket
# Previously: WebSocket handler (handle_research_websocket)
# Now: Simple function that returns response for HTTP endpoint
# =====================================================
def process_browser_query(query: str, session_id: Optional[str] = None) -> tuple:
    """
    Process a browser mode query and return the response and sources
    This is called by the HTTP endpoint in api.py
    
    Returns:
        tuple: (response_text, sources_dict)
    """
    print(f"[BROWSER AGENT] Processing query: {query[:50]}...")
    
    # Get the pre-initialized agent
    agent = get_research_agent()
    # =====================================================
    # ✅ NEW: Load history
    # =====================================================
    messages = [HumanMessage(content=query)]
    
    # Save user message to PostgreSQL if memory available
    if memory and session_id:
        try:
            history = memory.load_chat_messages(session_id)
            # Build conversation from history
            conv_messages = []
            for role, content in history[-10:]:
                if role == "user":
                    conv_messages.append(HumanMessage(content=content))
                else:
                    conv_messages.append(AIMessage(content=content))
            conv_messages.append(HumanMessage(content=query))
            messages = conv_messages
        except Exception as e:
            debug_print("MEMORY", f"Failed to load history: {e}")
    
    # Prepare input
    # agent_input = {
    #     "messages": [HumanMessage(content=query)]
    # }
    
    # Get response (not streaming for HTTP)
    result = agent.invoke({"messages": messages})
    
    # =====================================================
    # 🔁 MODIFIED: Handle different response formats
    # Now properly extracts both response text and sources
    # =====================================================
    
    response_text = ""
    sources_dict = {}
    
    # Case 1: Tool returned tuple with response_format="content_and_artifact"
    if hasattr(result, 'content') and hasattr(result, 'artifact'):
        response_text = result.content
        sources_dict = result.artifact
        debug_print("RESPONSE", f"Extracted from artifact: content length={len(response_text)}, sources={len(sources_dict)}")
    
    # Case 2: Result is a tuple (backward compatibility)
    elif isinstance(result, tuple) and len(result) == 2:
        response_text, sources_dict = result
        debug_print("RESPONSE", f"Extracted from tuple: content length={len(response_text)}, sources={len(sources_dict)}")
    
    # Case 3: Result has content attribute (AIMessage)
    elif hasattr(result, 'content'):
        response_text = result.content
        debug_print("RESPONSE", f"Extracted from content attribute: length={len(response_text)}")
    
    # Case 4: Result is a dict with messages
    elif isinstance(result, dict) and 'messages' in result:
        for msg in result['messages']:
            if hasattr(msg, 'content') and msg.content:
                response_text += msg.content
        debug_print("RESPONSE", f"Extracted from messages dict: length={len(response_text)}")
    
    # Case 5: Fallback to string conversion
    else:
        response_text = str(result)
        debug_print("RESPONSE", f"Fallback string conversion: length={len(response_text)}")
    
    # Save assistant response if memory available
    # Save to memory
    if memory and response_text and session_id:
        try:
            memory.add_user_message(f"[{session_id}] {query}")
            memory.add_assistant_message(f"[{session_id}] {response_text[:500]}...")
        except Exception as e:
            debug_print("MEMORY", f"Failed to save: {e}")
    
    return response_text, sources_dict

print("🚀 Pre-initializing research agent (this may take 20-30 seconds)...")
_research_agent = None

def get_research_agent():
    """Get or create the research agent singleton"""
    global _research_agent
    if _research_agent is None:
        _research_agent = create_research_agent()
        print("✅ Research agent initialized and ready")
    return _research_agent

# Initialize immediately so it's ready when first request arrives
get_research_agent()
# =====================================================

# ❌ REMOVED: WebSocket handler (handle_research_websocket)
# No longer needed - using HTTP instead