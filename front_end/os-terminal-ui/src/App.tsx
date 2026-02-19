import { useEffect, useState } from "react";
import Terminal from "./components/Terminal";
import Sidebar from "./components/Sidebar";
import { useWebSocket } from "./hooks/useWebSocket";

type Chat = {
  id: string;
  title: string;
};

export default function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ✅ MODIFIED: Destructure new methods from useWebSocket
  const { listChats, createChat, deleteChat, renameChat, sendMessage } = useWebSocket(() => {});

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
  }, []);

  const handleCreateChat = async () => {
    const newChat = await createChat();
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex relative">
      {/* ☰ Sidebar Toggle */}
      <button
        className="absolute top-4 left-4 z-50 text-white text-2xl"
        onClick={() => setSidebarOpen((v) => !v)}
      >
        ☰
      </button>

      {/* Sidebar */}
      {sidebarOpen && (
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

      {/* Terminal ALWAYS visible */}
      <div className="flex-1 flex items-center justify-center">
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
      </div>
    </div>
  )
}
