# agent_builder.py - Fixed for tool calling
import os
from langchain.agents import create_agent
from langchain_huggingface import HuggingFaceEndpoint, ChatHuggingFace
from dotenv import load_dotenv

import os

from terminal_tools import create_tools
from safety_middleware import create_safety_middleware

load_dotenv()

def build_terminal_agent(
    sandbox_root: str = None,
    model_name: str = None
):
    """Build terminal agent using Hugging Face Inference API"""
    
    if sandbox_root is None:
        sandbox_root = os.getcwd()
    sandbox_root = os.path.abspath(sandbox_root)
    
    # Get API key
    api_key = os.getenv("HUGGINGFACEHUB_API_TOKEN")
    if not api_key:
        raise ValueError("HUGGINGFACEHUB_API_TOKEN not found")
    
    # Get model name - FORCE a tool-calling compatible model
    if model_name is None:
        model_name = os.getenv("HUGGINGFACE_MODEL", "deepseek-ai/DeepSeek-V3")
    
  
    
    print(f"🤖 Using Hugging Face API model: {model_name}")
    
    # Create endpoint
    llm = ChatHuggingFace(llm=HuggingFaceEndpoint(
    repo_id="deepseek-ai/DeepSeek-V3",  # or any model you want
    task="text-generation",  # ADD THIS

    temperature=0,
    
    
    
    
))
    
    # Create tools
    tools = create_tools(sandbox_root, llm=llm)
    
    # Create middleware
    middleware = [create_safety_middleware(sandbox_root)]
    
    # System prompt - explicitly describe tool format
    system_prompt = f"""You are a FILE MANAGEMENT assistant operating in: {sandbox_root}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 AVAILABLE TOOLS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. read_file - Read file contents
2. write_file - Create/update files  
3. delete_path - Delete files/directories
4. list_directory - List directory contents
5. execute_command - Execute terminal commands
6. web_search - Search the internet for real-time information. Use this for current events, news, facts, or any query requiring up-to-date information.- Facts that change over time
   DO NOT use for general knowledge or definitions

🧠 IMPORTANT: YOU CAN SEE THE HISTORY ABOVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Look at the "CONVERSATION HISTORY" section above.
It contains the ENTIRE conversation so far.

When asked about previous questions:
- Check the history above
- Find the last User message
- Answer based on what you see there

DO NOT say you don't have memory.
DO NOT say you can't recall.
The history is RIGHT THERE. Use it.

RULES:
1. Only access files within {sandbox_root} and subdirectories
2. Cannot access files outside this directory
3. All paths must be relative to sandbox root
4. You are a FILE MANAGER, not a CODE WRITER
5. For code requests: create files with user's content, don't write complex logic
6. Use specific file tools for file operations
7. Use execute_command for shell commands
8. Confirm before deleting important files

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ CRITICAL: YOU ARE A FILE CREATOR, NOT A CODE SHOWER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


When users ask you to WRITE CODE (Python, JavaScript, HTML, CSS, etc.):

❌ NEVER do this:
   - Print the code in chat
   - Say "Here's the code"
   - Suggest they create it manually
   - Show examples without saving

✅ ALWAYS do this:
   1. USE the 'write_file' tool IMMEDIATELY
   2. Create a file with proper extension (.py, .js, .html, .css, .java, etc.)
   3. Put the COMPLETE working code in the file
   4. Confirm with "✅ Created filename.ext with [description]"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 EXAMPLES - YOU MUST FOLLOW THESE EXACTLY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

USER SAYS:                    YOU MUST USE write_file WITH:
─────────────────────────────────────────────────────────────
"fibonacci in python"         → fibonacci.py + complete code
"calculator in javascript"    → calculator.js + complete code  
"login form in html"          → login.html + complete code
"sorting algorithm"           → sorting.py + complete code
"todo app"                    → todo.py + complete code
"factorial function"          → factorial.py + complete code
"api endpoint"                → api.py + complete code
"css for website"             → style.css + complete code

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 WEB SEARCH EXAMPLES - WHEN TO USE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

USER SAYS:                           → USE web_search WITH:
─────────────────────────────────────────────────────────────
"latest news about AI"                → "latest AI news 2026"
"what happened today in tech"         → "technology news today"
"weather in New York"                  → "New York weather forecast"
"who won the super bowl"               → "super bowl 2026 winner"
"stock price of Tesla"                 → "Tesla stock price"
"current population of India"          → "India population 2026"
"new movies released"                  → "new movie releases this week"
"sports scores"                        → "today's sports scores"
"what is the capital of France"        → NO - use your knowledge (don't search)
"define machine learning"               → NO - use your knowledge
"write a poem"                          → NO - use your creativity
"create a file"                         → NO - use write_file tool

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ CRITICAL: FOLDER vs FILE CREATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

To CREATE a FOLDER:
   USE → execute_command with command="mkdir foldername"

To CREATE a FILE:
   USE → write_file with file_path="filename.txt", content="content"

EXAMPLES:
   "create folder called xyz" → execute_command with "mkdir xyz"
   "create file called xyz.txt" → write_file with "xyz.txt"

NEVER use write_file to create folders.
NEVER use execute_command to create files (use write_file).



Current location: {sandbox_root}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 SECURITY: Only access files in {sandbox_root}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Current location: {sandbox_root}

"""
    
    # Create agent with explicit response format
    try:
        # Create agent
        agent = create_agent(
            model=llm,
            tools=tools,
            system_prompt=system_prompt,
            middleware=middleware,
            debug=False,
            response_format="content"
        )
    except Exception as e:
        if "Unsupported schema type" in str(e):
           # print("⚠️  LangChain schema error. Using DeepSeek adapter...")
            
            from deepseek_adapter import create_manual_agent
            
            manual_agent_func = create_manual_agent(
                llm=llm,
                tools=tools,
                system_prompt=system_prompt
            )
            
            # FIXED: Create wrapper object with invoke method
            class AgentWrapper:
                def __init__(self, func):
                    self.func = func
                def invoke(self, input_dict):
                    return self.func(input_dict)
                def __call__(self, input_dict):
                    return self.invoke(input_dict)
            
            agent = AgentWrapper(manual_agent_func)
            return agent, sandbox_root
        else:
            raise e
        
# --- PATCHED RUN_AGENT_STREAM ---
def run_agent_stream(agent, user_input: str, session_dir: str, chat_history=None):
    """
    Wrapper around agent.invoke that forces all tools to use session_dir as sandbox_root.
    """

    yield "🤖 Agent started...\n"
    yield f"📂 CWD: {session_dir}\n"
    yield f"👤 User: {user_input}\n\n"

    # ======================================================
    # ✅ NEW: Inject history if available
    # Previously: agent had NO awareness of past messages
    # Now: we replay history into agent memory safely
    # ======================================================
    if chat_history and hasattr(agent, "memory") and hasattr(agent.memory, "chat_memory"):
        agent.memory.chat_memory.clear()  # prevent duplication

        for role, content in chat_history:
            if role == "user":
                agent.memory.chat_memory.add_user_message(content)
            else:
                agent.memory.chat_memory.add_ai_message(content)
    # ======================================================

    # Patch tools to force session_dir as sandbox_root (UNCHANGED)
    patched_roots = {}
    for tool in getattr(agent, "tools", []):
        if hasattr(tool, "sandbox"):
            patched_roots[tool] = tool.sandbox.sandbox_root
            tool.sandbox.sandbox_root = session_dir
            print(f"[DEBUG] Patched tool {tool} sandbox_root -> {session_dir}")

    try:
        result = agent.invoke({"input": user_input})

        if isinstance(result, dict) and "messages" in result:
            for msg in result["messages"]:
                if msg.content:
                    yield msg.content + "\n"
        else:
            yield str(result) + "\n"

        yield "\n✅ Agent finished.\n"

    except Exception as e:
        yield f"\n❌ Error: {str(e)}\n"

    finally:
        # Restore original sandbox roots (UNCHANGED)
        for tool, root in patched_roots.items():
            tool.sandbox.sandbox_root = root
            print(f"[DEBUG] Restored tool {tool} sandbox_root -> {root}")
        




# def run_agent_stream(agent, user_input):
#     for ch in f"Streaming test: {user_input}\n":
#         yield ch

    
