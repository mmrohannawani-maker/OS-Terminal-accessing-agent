import os
from fastapi import FastAPI, WebSocket
import asyncio
from agent_builder import build_terminal_agent, run_agent_stream
from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
from terminal_tools import set_user_path
from fastapi.responses import StreamingResponse
import asyncio

# =====================================================
# ✅ ADDED IMPORTS
# =====================================================
import json
import uuid
from memory_postgres import PostgresMemory
from fastapi import File, UploadFile, HTTPException
import shutil
from typing import List
# =====================================================
# ✅ NEW: CORS middleware
# =====================================================
from fastapi.middleware.cors import CORSMiddleware
# =====================================================
# ✅ NEW: Pydantic for HTTP request model
# =====================================================
from pydantic import BaseModel
from typing import Optional
# =====================================================

app = FastAPI()

# =====================================================
# ✅ NEW: Add CORS middleware
# =====================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://vibrant-patience-production-68b7.up.railway.app",
                   "https://os-terminal-accessing-agent-production.up.railway.app",
                   "http://localhost:5173",
                   "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# =====================================================

# =====================================================
# UNCHANGED: Working directory handling
# =====================================================
_CURRENT_DIR = None

def get_current_dir():
    return _CURRENT_DIR

def set_current_dir(path):
    global _CURRENT_DIR
    _CURRENT_DIR = os.path.abspath(path)
    return _CURRENT_DIR
# =====================================================

agent, _ = build_terminal_agent()

# =====================================================
# ✅ ADDED: Persistent DB-backed memory
# =====================================================
memory = PostgresMemory()
# =====================================================

# =====================================================
# ✅ NEW: Get directory listing function for file browser
# =====================================================
def get_directory_listing(path: str) -> list:
    """Get formatted list of files and folders in directory"""
    try:
        if not os.path.exists(path):
            return []
        
        items = []
        for item in os.listdir(path):
            item_path = os.path.join(path, item)
            try:
                is_dir = os.path.isdir(item_path)
                items.append({
                    "name": item,
                    "type": "dir" if is_dir else "file",
                    "size": os.path.getsize(item_path) if not is_dir else 0,
                    "path": item_path
                })
            except (PermissionError, OSError):
                continue
        
        return sorted(items, key=lambda x: (x['type'] != 'dir', x['name'].lower()))
    except Exception as e:
        print(f"[DEBUG] Error listing directory {path}: {e}")
        return []
# =====================================================

# =====================================================
# ✅ NEW: File upload endpoint
# =====================================================
@app.post("/api/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    """Upload files to the current working directory"""
    try:
        upload_dir = get_current_dir()
        if not upload_dir:
            upload_dir = "/app/uploads" if os.name != 'nt' else "./uploads"
            os.makedirs(upload_dir, exist_ok=True)
            set_current_dir(upload_dir)
        
        os.makedirs(upload_dir, exist_ok=True)
        
        saved_files = []
        for file in files:
            safe_filename = os.path.basename(file.filename)
            file_path = os.path.join(upload_dir, safe_filename)
            
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            saved_files.append({
                "name": safe_filename,
                "path": file_path,
                "size": os.path.getsize(file_path)
            })
        
        print(f"[DEBUG] Uploaded {len(saved_files)} files to {upload_dir}")
        
        return {
            "success": True,
            "path": upload_dir,
            "files": saved_files
        }
    except Exception as e:
        print(f"[DEBUG] Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
# =====================================================

# =====================================================
# ✅ NEW: HTTP endpoint for Browser Mode (no WebSocket)
# =====================================================
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

print("✅ Registering POST /api/browser-chat")

@app.get("/api/browser-chat")
async def browser_chat_get():
    return {"error": "This endpoint requires POST", "method": "GET", "message": "Use POST request with JSON body containing 'message' field"}
# =====================================================

@app.get("/")
async def root():
    return {
        "status": "online",
        "message": "Terminal Agent API is running",
        "websocket": "/ws",
        "browser_api": "/api/browser-chat",
        "upload": "/api/upload",
        "usage": "Connect to wss://your-app.railway.app/ws for Terminal Mode or POST to /api/browser-chat for Browser Mode"
    }

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": str(asyncio.get_event_loop().time())}

# =====================================================
# ✅ FIXED: GET endpoint for browser-chat (helps with debugging)
# =====================================================

@app.post("/api/browser/chat")
async def browser_chat(request: ChatRequest):
    """
    Simple HTTP endpoint for Browser Mode
    Returns complete response in one request with sources
    """
    print("🔥🔥🔥 FUNCTION IS BEING CALLED! 🔥🔥🔥")
    print(f"[BROWSER MODE] Received: {request.message[:50]}...")
    print(f"🟢 RECEIVED REQUEST: {request.message}")
    print(f"🟢 SESSION ID: {request.session_id}")
    
    try:
        # Import here to avoid circular imports
        from docsloadingagent import get_research_agent
        agent = get_research_agent()
        print("🟢 AGENT LOADED SUCCESSFULLY")

        # =====================================================
        # ✅ NEW: Detect if user is asking about previous conversation
        # =====================================================
        is_summary_question = any(phrase in request.message.lower() for phrase in [
            "what did we talk about", 
            "what was our last conversation",
            "recap", 
            "summary of our conversation",
            "what have we discussed",
            "last time we talked",
            "what did we discuss"
        ])

        summary_requested = False
        original_message = request.message
        
        if is_summary_question and request.session_id and memory:
            try:
                # Load ALL history for this session
                full_history = memory.load_chat_messages(request.session_id, limit=50)
                print(f"🟢 LOADED {len(full_history)} messages for summary")
                
                if len(full_history) > 2:
                    # Format ONLY user messages for the summary
                    user_messages = []
                    for role, content in full_history:
                        if role == "user" and "what is" not in content.lower()[:20]:
                            user_messages.append(content)
            
                    if user_messages:
                        history_text = "\n".join([f"- {msg}" for msg in user_messages[-10:]])
                    
                        # Create a special prompt for summarization
                        summary_prompt = f"""Based on the following user questions from our conversation, provide a summary of what topics we discussed:

        {history_text}

        Please provide a brief summary of the main topics the user asked about."""
                
                    request.message = summary_prompt
                    print("🟢 USING SUMMARY PROMPT")
            except Exception as e:
                print(f"🔴 ERROR preparing summary: {e}")
        # =====================================================

        # =====================================================
        # ✅ FIXED: Force correct history loading
        # =====================================================
        conversation_messages = []  # Use a fresh, clear variable name

        if request.session_id and memory:
            try:
                # Load previous messages for this session
                history = memory.load_chat_messages(request.session_id, limit=30)
                print(f"🟢 LOADED {len(history)} raw messages from history")
        
                # We need to build a clean conversation history
                # Start with the most recent messages and work backwards
                recent_history = history[-20:]  # Last 20 messages
        
                for role, content in recent_history:
                    if role == "user":
                        # Always add user messages
                        conversation_messages.append(HumanMessage(content=content))
                        print(f"   ➕ Added USER message: {content[:30]}...")
                    else:
                        # Only add assistant messages that are FINAL ANSWERS, not research results
                        if "Based on my research" in content:
                            # This is a final answer - add it
                            conversation_messages.append(AIMessage(content=content))
                            print(f"   ➕ Added ASSISTANT final answer: {content[:30]}...")
                        else:
                            # Skip research results
                            print(f"   ⏭️ Skipped assistant research message")
            except Exception as e:
                print(f"[DEBUG] Failed to load history: {e}")


        # Add the current user message (which might be the summary prompt)
        conversation_messages.append(HumanMessage(content=request.message))
        print(f"🟢 TOTAL MESSAGES IN CONTEXT: {len(conversation_messages)}")
        print(f"🟢 SENDING TO AGENT: {[type(m).__name__ for m in conversation_messages]}")
        # =====================================================

        # =====================================================
        # 🔁 MODIFIED: Invoke agent with full conversation context
        # =====================================================
        result = agent.invoke({"messages": conversation_messages})
        print("🟢 AGENT INVOKE COMPLETE")

        # =====================================================
        # ✅ FIXED: Prioritized Source Extraction
        # =====================================================
        response = ""
        sources = {}

        # 1. Check for messages list (most common in LangGraph)
        if isinstance(result, dict) and 'messages' in result:
            print("🟢 CHECKING RESULT['messages']...")
            for msg in result['messages']:
                # Check if THIS message has an artifact (it's likely the ToolMessage)
                if hasattr(msg, 'artifact') and msg.artifact:
                    sources = msg.artifact
                    print(f"🎯 SOURCES FOUND in artifact: {sources}")
                    # Don't break, continue to find content

                # Collect content from all messages (AIMessages, ToolMessages)
                if hasattr(msg, 'content') and msg.content:
                    response += msg.content

            print(f"🟢 EXTRACTED FROM MESSAGES - Response length: {len(response)}")

        # 2. If no messages, check if result itself is a tuple
        elif isinstance(result, tuple) and len(result) == 2:
            response, sources = result
            print(f"🟢 EXTRACTED FROM TUPLE - Sources: {len(sources)}")

        # 3. Check for direct artifact on result
        elif hasattr(result, 'artifact') and result.artifact:
            sources = result.artifact
            print(f"🟢 EXTRACTED FROM ARTIFACT - Sources: {len(sources)}")
            if hasattr(result, 'content'):
                response = result.content
            else:
                response = str(result)

        # 4. Simple content attribute
        elif hasattr(result, 'content'):
            response = result.content
            print(f"🟢 EXTRACTED FROM CONTENT")

        # 5. Fallback
        else:
            response = str(result)
            print(f"🟢 FALLBACK TO STRING")

        print(f"✅ FINAL - Response length: {len(response)}, Sources found: {len(sources)}")
        # =====================================================
        
        # =====================================================
        # 🔁 FIXED: Save to memory with clean format
        # =====================================================
        if request.session_id and memory:
            try:
                # Save user message (original, not the summary prompt)
                if summary_requested:
                    memory.add_user_message(f"[{request.session_id}] {original_message}")
                    print(f"🟢 USER MESSAGE SAVED (original query)")
                else:
                    memory.add_user_message(f"[{request.session_id}] {request.message}")
                    print(f"🟢 USER MESSAGE SAVED")
                
                # Save assistant response
                if response:
                    memory.add_assistant_message(f"[{request.session_id}] {response}")
                    print(f"🟢 ASSISTANT RESPONSE SAVED ({len(response)} chars)")
            except Exception as e:
                print(f"[DEBUG] Failed to save to memory: {e}")
        
        # =====================================================
        # 🔁 MODIFIED: Return both response and sources
        # =====================================================
        print(f"🔴🔴🔴 RESPONSE BEING SENT TO FRONTEND:")
        print(f"🔴 LENGTH: {len(response)}")
        print(f"🔴 PREVIEW: {response[:200]}...")
        print(f"🔴 CONTAINS 'what is regression'? {'what is regression' in response.lower()}")
        print(f"🔴 CONTAINS 'classification'? {'classification' in response.lower()}")


        return {
            "response": response,
            "sources": sources,
            "session_id": request.session_id
        }
        
    except Exception as e:
        print(f"🔴 ERROR IN BROWSER CHAT: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"error": str(e), "sources": {}}

# =====================================================

# =====================================================
# ✅ FIXED: Route debugging at startup
# =====================================================
@app.on_event("startup")
async def show_routes():
    print("="*60)
    print("REGISTERED ROUTES:")
    route_list = []
    for route in app.routes:
        methods = getattr(route, 'methods', None)
        if methods:
            route_list.append(f"  {route.path} - {methods}")
            print(f"  {route.path} - {methods}")
        else:
            route_list.append(f"  {route.path} - WebSocket")
            print(f"  {route.path} - WebSocket")
    print("="*60)
    
    # Verify browser-chat endpoints are registered
    print("\n✅ BROWSER-CHAT ENDPOINTS:")
    print("  GET /api/browser-chat - Should be registered")
    print("  POST /api/browser-chat - Should be registered")
    print("="*60)
# =====================================================

# =====================================================
# UNCHANGED: WebSocket endpoint for Terminal Mode
# =====================================================
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    print("[DEBUG] WebSocket connected")
    
    await ws.send_text("📌 Session started. Click folders to navigate, then type commands.\n")

    # =================================================
    # Agent path context updater
    # =================================================
    def update_agent_context(agent, new_path):
        try:
            if hasattr(agent, 'memory') and hasattr(agent.memory, 'chat_memory'):
                agent.memory.chat_memory.add_message(
                    SystemMessage(content=f"[SYSTEM] Working directory changed to: {new_path}")
                )
            elif hasattr(agent, 'func') and hasattr(agent.func, 'history'):
                agent.func.history.append(f"System: Working directory changed to {new_path}")
            else:
                if not hasattr(agent, '_path_context'):
                    agent._path_context = []
                agent._path_context.append(f"Current path: {new_path}")
        except Exception as e:
            print(f"[DEBUG] Could not update agent context: {e}")
    # =================================================

    # =================================================
    # Sandbox updater
    # =================================================
    def update_session_sandbox(agent, new_root: str):
        new_root = os.path.abspath(new_root)
        for tool in getattr(agent, "tools", []):
            if hasattr(tool, "sandbox"):
                tool.sandbox.sandbox_root = new_root
        for tool in getattr(agent, "tools", []):
            if hasattr(tool, "__self__") and hasattr(tool.__self__, "sandbox"):
                tool.__self__.sandbox.sandbox_root = new_root
        if hasattr(agent, "sandbox_root"):
            agent.sandbox_root = new_root
    # =================================================

    # =================================================
    # MAIN LOOP
    # =================================================
    while True:
        chat_id = None
        try:
            raw = await ws.receive_text()
        except Exception as e:
            print(f"[DEBUG] WebSocket receive error: {e}")
            break

        try:
            data = json.loads(raw)
            msg_type = data.get("type")
        except Exception:
            data = None
            msg_type = None
            user_query = raw

        # =================================================
        # File browser - list directory contents
        # =================================================
        if msg_type == "list_dir":
            current = get_current_dir()
            if not current:
                await ws.send_text(json.dumps({
                    "type": "directory_list",
                    "current_dir": "No directory selected",
                    "files": []
                }))
                continue
                
            target_path = data.get("path", ".")
            
            if target_path == ".":
                target_path = current
            elif target_path == "..":
                target_path = os.path.dirname(current)
            else:
                target_path = os.path.join(current, target_path)
            
            if not target_path.startswith(current):
                target_path = current
            
            files = get_directory_listing(target_path)
            
            await ws.send_text(json.dumps({
                "type": "directory_list",
                "current_dir": target_path,
                "files": files,
                "requestId": data.get("requestId")
            }))
            continue

        # =================================================
        # Sidebar – list chats
        # =================================================
        if msg_type == "list_chats":
            chats = memory.list_chats()
            print("[DEBUG] Sending chat list:", chats)
            await ws.send_text(json.dumps({
                "type": "chat_list",
                "chats": [
                    {"id": str(cid), "title": title}
                    for cid, title in chats
                ],
                "requestId": data.get("requestId")
            }))
            continue

        # =================================================
        # Create new chat
        # =================================================
        if msg_type == "new_chat":
            chat_id = str(uuid.uuid4())
            title = data.get("title", "New Chat")

            memory.create_chat(chat_id, title)

            print(f"[DEBUG] Created new chat: {chat_id} - {title}")

            await ws.send_text(json.dumps({
                "type": "chat_created",
                "chat_id": chat_id,
                "title": title,
                "requestId": data.get("requestId")
            }))
            continue

        # =================================================
        # Delete a chat handler
        # =================================================
        if msg_type == "delete_chat":
            chat_id = data.get("chat_id")
            if chat_id:
                memory.delete_chat(chat_id)
                print(f"[DEBUG] Deleted chat: {chat_id}")
                await ws.send_text(json.dumps({
                    "type": "chat_deleted",
                    "chat_id": chat_id,
                    "requestId": data.get("requestId")
                }))
            continue

        # =================================================
        # Message handling
        # =================================================
        if msg_type == "message":
            chat_id = data["chat_id"]
            user_query = data["content"]

            memory.save_chat_message(chat_id, "user", user_query)

            current_title = memory.get_chat_title(chat_id)
            if current_title == "New Chat":
                new_title = user_query[:30] + ("..." if len(user_query) > 30 else "")
                try:
                    if new_title:
                        memory.rename_chat(chat_id, new_title)
                        print(f"[DEBUG] Renamed chat {chat_id} to: {new_title}")
                        await ws.send_text(json.dumps({
                            "type": "chat_renamed",
                            "chat_id": chat_id,
                            "title": new_title,
                            "requestId": data.get("requestId")
                        }))
                except Exception as e:
                    print(f"[DEBUG] Failed to auto-rename chat: {e}")

        if 'user_query' not in locals():
            user_query = raw

        print(f"[DEBUG] Received user query: {user_query}")

        agent_response = ""
        current_dir = get_current_dir()
        
        if not current_dir:
            await ws.send_text("⚠️ No directory selected. Please select a folder first using the file browser.\n")
            continue
        
        history = memory.load_chat_messages(chat_id) if chat_id else []
        print(f"[DEBUG] Loaded history: {len(history)} messages")
        print(f"[DEBUG] Current directory: {current_dir}")

        for chunk in run_agent_stream(agent, user_query, current_dir, history):
            print(f"[DEBUG] chunk: {chunk}") 
            agent_response += chunk
            await ws.send_text(chunk)
            print(f"[DEBUG] Streaming chunk: {chunk}")
            await asyncio.sleep(0)

        if msg_type == "message" and chat_id:
            memory.save_chat_message(chat_id, "assistant", agent_response)
            print(f"[DEBUG] Saved assistant response, length={len(agent_response)}")

# Add this import at the top


# Add this new endpoint

# At the VERY BOTTOM of api.py, add this:
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

# enf
