import os
from fastapi import FastAPI, WebSocket
import asyncio
from agent_builder import build_terminal_agent, run_agent_stream
from langchain_core.messages import SystemMessage
from terminal_tools import set_user_path

# =====================================================
# ✅ ADDED IMPORTS (NEW)
# Previously: WebSocket accepted plain text only
# Now: JSON protocol for sidebar + chat persistence
# =====================================================
import json
import uuid
from memory_postgres import PostgresMemory
# =====================================================

app = FastAPI()

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
# ✅ ADDED: Persistent DB-backed memory (NEW)
# Previously: No session/chat persistence
# =====================================================
memory = PostgresMemory()
# =====================================================


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    print("[DEBUG] WebSocket connected")
    await ws.send_text("📌 Session started.\nUse: setpath <absolute_path>\n")

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

        # =================================================
        # 🔁 REPLACED
        # PREVIOUSLY:
        #   user_query = await ws.receive_text()
        #
        # NOW:
        #   Supports JSON (chat_id, sidebar actions)
        #   AND plain-text fallback for terminal usage
        # =================================================
        chat_id = None
        raw = await ws.receive_text()

        try:
            data = json.loads(raw)
            msg_type = data.get("type")
        except Exception:
            data = None
            msg_type = None
            user_query = raw  # ✅ fallback (UNCHANGED behavior)
        # =================================================

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
                "requestId": data.get("requestId")  # <--- add this
            }))
            continue
        # =================================================

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
                "requestId": data.get("requestId")  # <--- add this
            }))
            continue
        # =================================================
        # =================================================
        # ✅ NEW: Delete a chat handler
        # Allows frontend to delete a chat by sending {"type":"delete_chat","chat_id":<id>}
        # =================================================
        if msg_type == "delete_chat":
            chat_id = data.get("chat_id")
            if chat_id:
                memory.delete_chat(chat_id)
                print(f"[DEBUG] Deleted chat: {chat_id}")
                # Send confirmation back to frontend
                await ws.send_text(json.dumps({
                    "type": "chat_deleted",
                    "chat_id": chat_id,
                    "requestId": data.get("requestId")  # optional for frontend mapping
                }))
            continue
        # =================================================

        # =================================================
        # 🔁 MODIFIED: Message handling
        # Previously: user_query came directly from socket
        # Now: comes from JSON payload
       # =================================================
        # ✅ NEW: Auto-rename chat based on first user message
        # If the chat has default title "New Chat", we ask the agent/LLM to create a short title
        # =================================================
        if msg_type == "message":
            chat_id = data["chat_id"]
            user_query = data["content"]

            # Save user message BEFORE agent runs (existing)
            memory.save_chat_message(chat_id, "user", user_query)

            # Check chat title and rename if default
            current_title = memory.get_chat_title(chat_id)  # You need this method in PostgresMemory
            if current_title == "New Chat":
                # Prepare a prompt for the LLM to generate a short 3-5 word title
                title_prompt = (
                    f"Create a short 3-5 word title for this chat based on the first user message:\n"
                    f"{user_query}"
                )
                try:
                    # Use agent to get title (assumes agent.run returns string)
                    new_title = agent.run(title_prompt).strip()
                    if new_title:
                        memory.rename_chat(chat_id, new_title)
                        print(f"[DEBUG] Renamed chat {chat_id} to: {new_title}")
                        # Notify frontend
                        await ws.send_text(json.dumps({
                            "type": "chat_renamed",
                            "chat_id": chat_id,
                            "title": new_title
                        }))
                except Exception as e:
                    print(f"[DEBUG] Failed to auto-rename chat: {e}")
        # =================================================

        print(f"[DEBUG] Received user query: {user_query}")

        # =================================================
        # UNCHANGED: setpath handling
        # =================================================
        if user_query.lower().startswith("setpath "):
            path = user_query[8:].strip()
            abs_path = os.path.abspath(path)

            if os.path.isdir(abs_path):
                set_current_dir(abs_path)
                set_user_path(abs_path)
                update_session_sandbox(agent, get_current_dir())
                update_agent_context(agent, get_current_dir())
                await ws.send_text(f"📁 Working directory set to:\n{get_current_dir()}\n")
                print(f"[DEBUG] Set working directory to {get_current_dir()}")
            else:
                await ws.send_text("❌ Invalid path\n")
                print(f"[DEBUG] Invalid path attempted: {abs_path}")
            continue
        # =================================================

        if get_current_dir() is None:
            await ws.send_text("⚠️ Please set working directory first using:\nsetpath <path>\n")
            continue

        # =================================================
        # 🔁 MODIFIED STREAMING LOOP
        #
        # PREVIOUSLY:
        #   streamed output only
        #
        # NOW:
        #   stream + collect + persist assistant reply
        # =================================================
        
        agent_response = ""
        history = memory.load_chat_messages(chat_id) if chat_id else []
        print(f"[DEBUG] Loaded history: {len(history)} messages")
        

        for chunk in run_agent_stream(agent, user_query, get_current_dir(), history):
            print(f"[DEBUG] chunk: {chunk}") 
            agent_response += chunk
            await ws.send_text(chunk)
            print(f"[DEBUG] Streaming chunk: {chunk}")
            await asyncio.sleep(0)

        # =================================================
        # ✅ NEW: Save assistant response AFTER streaming
        # =================================================
        if msg_type == "message":
            memory.save_chat_message(chat_id, "assistant", agent_response)
            print(f"[DEBUG] Saved assistant response, length={len(agent_response)}")

        # =================================================
