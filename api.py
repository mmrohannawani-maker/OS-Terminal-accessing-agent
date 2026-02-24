import os
from fastapi import FastAPI, WebSocket
import asyncio
from agent_builder import build_terminal_agent, run_agent_stream
from langchain_core.messages import SystemMessage, HumanMessage  # ← ADD HumanMessage
from terminal_tools import set_user_path

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
    allow_origins=["*"],  # In production, replace with your frontend URL
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

@app.post("/api/browser-chat")
async def browser_chat(request: ChatRequest):
    """
    Simple HTTP endpoint for Browser Mode
    Returns complete response in one request
    """
    print("🔥🔥🔥 FUNCTION IS BEING CALLED! 🔥🔥🔥")  # ← ADD THIS LINE

    print(f"[BROWSER MODE] Received: {request.message[:50]}...")
    print(f"🟢 RECEIVED REQUEST: {request.message}")  # ← ADD THIS
    print(f"🟢 SESSION ID: {request.session_id}")     # ← ADD THIS
    
    try:
        # Import here to avoid circular imports
        from docsloadingagent import get_research_agent
        agent = get_research_agent()
        
        # Simple invoke (not stream)
        result = agent.invoke({
            "messages": [HumanMessage(content=request.message)]
        })
        print("🟢 AGENT INVOKE COMPLETE")  # ← ADD THIS

        # Extract response
        response = ""
        if hasattr(result, 'content'):
            response = result.content
        elif isinstance(result, dict) and 'messages' in result:
            for msg in result['messages']:
                if hasattr(msg, 'content') and msg.content:
                    response += msg.content
        
        # Save to memory if session_id provided
        if request.session_id and memory:
            try:
                memory.add_user_message(f"[{request.session_id}] {request.message}")
                if response:
                    memory.add_assistant_message(f"[{request.session_id}] {response[:500]}...")
            except Exception as e:
                print(f"[DEBUG] Failed to save to memory: {e}")

        print(f"🟢 RESPONSE LENGTH: {len(response)}")  # ← ADD THIS
        
        return {"response": response, "session_id": request.session_id}
        
    except Exception as e:
        print(f"[ERROR] Browser chat failed: {e}")
        print(f"🔴 ERROR: {str(e)}")  # ← ADD THIS
        import traceback
        traceback.print_exc()
        return {"error": str(e)}
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
# ❌ REMOVED: WebSocket endpoint for Browser Mode
# Previously: @app.websocket("/ws-browser") was causing issues
# Now: Using HTTP POST /api/browser-chat instead
# =====================================================
# The entire WebSocket browser endpoint has been removed
# =====================================================

@app.on_event("startup")
async def show_routes():
    print("="*60)
    print("REGISTERED ROUTES:")
    for route in app.routes:
        methods = getattr(route, 'methods', None)
        if methods:
            print(f"  {route.path} - {methods}")
        else:
            print(f"  {route.path} - WebSocket")
    print("="*60)

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    print("[DEBUG] WebSocket connected")
    
    await ws.send_text("📌 Session started. Click folders to navigate, then type commands.\n")

    # =================================================
    # UNCHANGED: Agent path context updater
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
    # UNCHANGED: Sandbox updater
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
        # ✅ NEW: File browser - list directory contents
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
        # ✅ NEW: Sidebar – list chats
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
        # ✅ NEW: Create new chat
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
        # ✅ NEW: Delete a chat handler
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
        # 🔁 MODIFIED: Message handling
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



# At the VERY BOTTOM of api.py, add this:
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)