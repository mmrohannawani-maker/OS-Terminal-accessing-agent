# memory_postgres.py - Single thread PostgreSQL memory
import os
import json
from datetime import datetime
from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

load_dotenv()

class PostgresMemory:
    """Single thread PostgreSQL memory - ONE conversation only"""
    
    def __init__(self):
        self.db_url = os.getenv("POSTGRES_URL", "postgresql://postgres:Rohan123@localhost:5432/OS_agent")
        self._init_db()
       # print("✅ PostgreSQL memory initialized")
    
    def _init_db(self):
        """Initialize database table"""
        conn = psycopg.connect(self.db_url, autocommit=True)
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS chat_history (
                    id SERIAL PRIMARY KEY,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """)
            # ✅ NEW: Tables for multi-chat support (sidebar + resume)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS chats (
                    id UUID PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id SERIAL PRIMARY KEY,
                    chat_id UUID,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)
        conn.close()
    
    def add_user_message(self, content: str):
        """Add user message"""
        #print(f"🔵 ATTEMPTING TO SAVE USER MESSAGE: {content[:50]}...")
        try:
            conn = psycopg.connect(self.db_url, autocommit=True)
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO chat_history (role, content) VALUES (%s, %s)",
                    ('user', content)
                )
                affected = cur.rowcount
            conn.close()
           # print(f"✅ SUCCESS: {affected} row inserted for user message")

            # Verify immediately
            self.verify_last_message('user', content)
        except Exception as e:
            print(f"❌ FAILED to save user message: {e}")
            import traceback
            traceback.print_exc()
    
    def add_assistant_message(self, content: str):
        """Add assistant message"""
        #print(f"🟢 ATTEMPTING TO SAVE ASSISTANT MESSAGE: {content[:50]}...")
        try:
            conn = psycopg.connect(self.db_url, autocommit=True)
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO chat_history (role, content) VALUES (%s, %s)",
                    ('assistant', content)
                )
                affected = cur.rowcount
            conn.close()
           # print(f"✅ SUCCESS: {affected} row inserted for assistant message")

            # Verify immediately
            self.verify_last_message('assistant', content)
        except Exception as e:
            print(f"❌ FAILED to save assistant message: {e}")
            import traceback
            traceback.print_exc()
            

    def verify_last_message(self, expected_role, expected_content_preview):
        """Verify the last message was saved correctly"""
        try:
            conn = psycopg.connect(self.db_url, autocommit=True)
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT role, content FROM chat_history ORDER BY id DESC LIMIT 1"
                )
                last = cur.fetchone()
            conn.close()
        
            # if last:
            #     role, content = last
            #     #print(f"🔍 VERIFICATION - Last message in DB: {role}: {content[:50]}...")
            #     if role == expected_role and expected_content_preview in content:
            #         print("✅ VERIFICATION PASSED")
            #     else:
            #         print("❌ VERIFICATION FAILED - Content mismatch")
            # else:
            #     print("❌ VERIFICATION FAILED - No messages in database")
        except Exception as e:
            print(f"❌ Verification error: {e}")

    # def count_messages(self):
    #     """Count total messages in database"""
    #     try:
    #         conn = psycopg.connect(self.db_url, autocommit=True)
    #         with conn.cursor() as cur:
    #             cur.execute("SELECT COUNT(*) FROM chat_history")
    #             count = cur.fetchone()[0]
    #         conn.close()
    #         print(f"📊 Total messages in database: {count}")
    #         return count
    #     except Exception as e:
    #         print(f"❌ Error counting messages: {e}")
    #         return 0
    
    def get_history(self, limit=50):  # Increase limit to 50
        """Get formatted chat history with DEBUG"""
        try:
            conn = psycopg.connect(self.db_url, autocommit=True)
            with conn.cursor() as cur:
                # Get the MOST RECENT messages first, then reverse for display
                cur.execute("""
                    SELECT role, content FROM chat_history 
                    ORDER BY timestamp DESC 
                    LIMIT %s
                """, (limit,))
                rows = cur.fetchall()
            conn.close()
        
            #print(f"🔍 DEBUG: Found {len(rows)} messages in database")
        
            if not rows:
                print("⚠️ DEBUG: No history found in database")
                return "No previous conversation."
        
            # Reverse to show oldest first (chronological order)
            history = []
            for role, content in reversed(rows):
                history.append(f"{'User' if role == 'user' else 'Assistant'}: {content}")
        
            result = "\n".join(history)
           # print(f"✅ DEBUG: Formatted history ({len(result)} chars)")
            return result
        
        except Exception as e:
            print(f"❌ DEBUG: Error getting history: {e}")
            return "Error retrieving conversation history."
        
    # ✅ NEW: Create a chat (used once per session)
    def create_chat(self, chat_id, title):
        conn = psycopg.connect(self.db_url, autocommit=True)
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO chats (id, title) VALUES (%s, %s)",
                (chat_id, title)
            )
        conn.close()

    # ✅ NEW: Save message for specific chat
    def save_chat_message(self, chat_id, role, content):
        conn = psycopg.connect(self.db_url, autocommit=True)
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO messages (chat_id, role, content) VALUES (%s, %s, %s)",
                (chat_id, role, content)
            )
        conn.close()

    # ✅ NEW: Load messages for a chat (resume chat)
    def load_chat_messages(self, chat_id):
        conn = psycopg.connect(self.db_url, autocommit=True)
        with conn.cursor() as cur:
            cur.execute(
                "SELECT role, content FROM messages WHERE chat_id=%s ORDER BY id",
                (chat_id,)
            )
            rows = cur.fetchall()
        conn.close()
        return rows
    
    # ✅ NEW: Sidebar chat list
    def list_chats(self):
        conn = psycopg.connect(self.db_url, autocommit=True)
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, title FROM chats ORDER BY created_at DESC"
            )
            rows = cur.fetchall()
        conn.close()
        return rows
     # ✅ NEW: Get chat title by chat_id
    def get_chat_title(self, chat_id):
        """Return the current title of a chat"""
        try:
            conn = psycopg.connect(self.db_url, autocommit=True)
            with conn.cursor() as cur:
                cur.execute("SELECT title FROM chats WHERE id=%s", (chat_id,))
                row = cur.fetchone()
            conn.close()
            return row[0] if row else None
        except Exception as e:
            print(f"❌ Error getting chat title: {e}")
            return None
        
    # ✅ NEW: Rename a chat
    def rename_chat(self, chat_id, new_title):
        """Update chat title"""
        try:
            conn = psycopg.connect(self.db_url, autocommit=True)
            with conn.cursor() as cur:
                cur.execute("UPDATE chats SET title=%s WHERE id=%s", (new_title, chat_id))
            conn.close()
        except Exception as e:
            print(f"❌ Error renaming chat: {e}")

    # ✅ NEW: Delete a chat and its messages
    def delete_chat(self, chat_id):
        """Delete a chat and all its messages"""
        try:
            conn = psycopg.connect(self.db_url, autocommit=True)
            with conn.cursor() as cur:
                # Delete messages first
                cur.execute("DELETE FROM messages WHERE chat_id=%s", (chat_id,))
                # Delete chat
                cur.execute("DELETE FROM chats WHERE id=%s", (chat_id,))
            conn.close()
        except Exception as e:
            print(f"❌ Error deleting chat: {e}")

