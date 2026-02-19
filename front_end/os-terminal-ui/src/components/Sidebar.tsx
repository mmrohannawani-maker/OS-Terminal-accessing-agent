type Chat = {
  id: string;
  title: string;
};

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onCreateChat: () => void;

  // ✅ NEW props for delete and rename
  onDeleteChat?: (chatId: string) => void;
  onRenameChat?: (chatId: string, newTitle: string) => void;
}

export default function Sidebar({
  chats,
  activeChatId,
  onSelectChat,
  onCreateChat,
  onDeleteChat,
  onRenameChat,
}: SidebarProps) {
  return (
    <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col">
      <div className="p-3 border-b border-zinc-800">
        <button
          className="w-full bg-green-600 py-2 rounded hover:bg-green-700"
          onClick={onCreateChat}
        >
          + New Chat
        </button>
      </div>

      {/* Scrollable chat list */}
      <div className="flex-1 overflow-y-auto">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`flex justify-between items-center px-3 py-2 cursor-pointer text-sm ${
              chat.id === activeChatId
                ? "bg-zinc-800 text-green-400"
                : "hover:bg-zinc-900"
            }`}
          >
            {/* Chat title clickable */}
            <span onClick={() => onSelectChat(chat.id)} className="flex-1">
              {chat.title}
            </span>

            {/* ✅ NEW: Rename button */}
            {onRenameChat && (
              <button
                className="ml-2 text-yellow-400 hover:text-yellow-300"
                onClick={async (e) => {
                  e.stopPropagation();
                  const newTitle = prompt("Enter new chat title:", chat.title);
                  if (newTitle?.trim()) {
                    await onRenameChat(chat.id, newTitle.trim());
                  }
                }}
              >
                ✎
              </button>
            )}

            {/* ✅ NEW: Delete button */}
            {onDeleteChat && (
              <button
                className="ml-1 text-red-500 hover:text-red-400"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChat(chat.id);
                }}
              >
                🗑
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
