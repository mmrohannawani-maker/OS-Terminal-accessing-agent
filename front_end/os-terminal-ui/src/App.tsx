import { useEffect, useState } from "react";
import Terminal from "./components/Terminal";
import Sidebar from "./components/Sidebar";
import SimpleBrowserMode from "./components/SimpleBrowserMode";
import ModeSelector from "./components/ModeSelector";
import { useWebSocket } from "./hooks/useWebSocket";

type Chat = {
  id: string;
  title: string;
};

// =====================================================
// ✅ NEW: Mode type for switching between terminal and browser
// Previously: No mode switching
// Now: Supports two modes
// =====================================================
type Mode = "terminal" | "browser";
// =====================================================

export default function App() {
  // =====================================================
  // ✅ NEW: Mode state
  // Previously: Always terminal mode
  // Now: Can switch between terminal and browser
  // =====================================================
  const [mode, setMode] = useState<Mode>("terminal");
  // =====================================================

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ✅ MODIFIED: Destructure new methods from useWebSocket
  // 🔁 REPLACED: Previously had no parameters
  // 🔁 FIXED: Now passing onMessage callback as first param and URL as second param
  const { listChats, createChat, deleteChat, renameChat, sendMessage } = useWebSocket(
    // 🔁 FIXED: First parameter is the onMessage callback function
    (data) => {
      console.log("📨 Message from server:", data);
      // You can add state updates here if needed
    },
    // 🔁 FIXED: Second parameter is the WebSocket URL
    import.meta.env.PROD 
      ? 'wss://vibrant-patience-production-68b7.up.railway.app/ws'  // ← NEW DOMAIN
      : 'ws://localhost:8000/ws'
    );

  // ✅ NEW: Handle sending user message AND auto-rename chat based on first user query
  const handleUserMessage = async (content: string, chatId: string) => {
    // Send the message to backend
    await sendMessage(content, chatId);

    // Auto-rename chat if first message and title is still "New Chat"
    const currentTitle = chats.find(c => c.id === chatId)?.title;
    if (currentTitle === "New Chat" && content.trim()) {
      const newTitle = content.slice(0, 30); // first 30 chars of user query
      await renameChat(chatId, newTitle);
      setChats(prev =>
        prev.map(c => (c.id === chatId ? { ...c, title: newTitle } : c))
      );
    }
  };

  /* ✅ FIXED: always guarantee an active chat */
  useEffect(() => {
    // =================================================
    // 🔁 MODIFIED: Only initialize chats in terminal mode
    // Previously: Always initialized chats
    // Now: Skips chat initialization in browser mode
    // =================================================
    if (mode !== "terminal") return;
    
    const init = async () => {
      const loadedChats = await listChats();

      if (loadedChats.length === 0) {
        const newChat = await createChat();
        setChats([newChat]);
        setActiveChatId(newChat.id);
      } else {
        setChats(loadedChats);
        setActiveChatId(loadedChats[0].id);
      }
    };

    init();
  }, [mode]); // 🔁 MODIFIED: Added mode as dependency

  const handleCreateChat = async () => {
    const newChat = await createChat();
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex relative">
      {/* ================================================= */}
      {/* ✅ NEW: Mode Selector - Always visible at top */}
      {/* Previously: No mode selector */}
      {/* Now: Allows switching between terminal and browser modes */}
      {/* ================================================= */}
      <div className="absolute top-4 right-4 z-50">
        <ModeSelector currentMode={mode} onModeChange={setMode} />
      </div>
      {/* ================================================= */}

      {/* ================================================= */}
      {/* 🔁 MODIFIED: Sidebar toggle - only visible in terminal mode */}
      {/* Previously: Always visible */}
      {/* Now: Hidden in browser mode */}
      {/* ================================================= */}
      {mode === "terminal" && (
        <button
          className="absolute top-4 left-4 z-50 text-white text-2xl"
          onClick={() => setSidebarOpen((v) => !v)}
        >
          ☰
        </button>
      )}
      {/* ================================================= */}

      {/* ================================================= */}
      {/* 🔁 MODIFIED: Sidebar - only visible in terminal mode */}
      {/* Previously: Always visible when open */}
      {/* Now: Hidden in browser mode */}
      {/* ================================================= */}
      {mode === "terminal" && sidebarOpen && (
        <Sidebar
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={(id) => {
            setActiveChatId(id);
            setSidebarOpen(false);
          }}
          onCreateChat={handleCreateChat}

          // ✅ NEW: Delete chat callback
          onDeleteChat={async (chatId) => {
            if (!window.confirm("Delete this chat?")) return;
            await deleteChat(chatId);
            setChats((prev) => prev.filter((c) => c.id !== chatId));
            if (activeChatId === chatId) setActiveChatId(chats[0]?.id || null);
          }}

          // ✅ NEW: Rename chat callback
          onRenameChat={async (chatId, newTitle) => {
            await renameChat(chatId, newTitle);
            setChats((prev) =>
              prev.map((c) => (c.id === chatId ? { ...c, title: newTitle } : c))
            );
          }}
        />
      )}
      {/* ================================================= */}

      {/* ================================================= */}
      {/* 🔁 MODIFIED: Main content - conditionally render based on mode */}
      {/* Previously: Always rendered Terminal */}
      {/* Now: Renders Terminal OR SimpleBrowserMode based on mode */}
      {/* ================================================= */}
      <div className="flex-1 flex items-center justify-center">
        {mode === "terminal" ? (
          <Terminal
            chatId={activeChatId}
            onEnsureChat={async () => {
              const newChat = await createChat();
              setChats((prev) => [newChat, ...prev]);
              setActiveChatId(newChat.id);
              return newChat.id;
            }}
            onSend={async (content: string) => handleUserMessage(content, activeChatId!)}
          />
        ) : (
          <SimpleBrowserMode />
        )}
      </div>
      {/* ================================================= */}
    </div>
  )
}