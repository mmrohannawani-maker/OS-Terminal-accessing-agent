import { useState, useEffect, useRef } from "react";
import InputBox from "./InputBox";
import { useWebSocket } from "../hooks/useWebSocket";
// =====================================================
// ✅ NEW: Import FileBrowser component
// Previously: No file browser
// Now: Visual file navigation
// =====================================================
import FileBrowser from "./FileBrowser";

type TerminalMessage = {
  role: "user" | "agent";
  content: string;
  streaming?: boolean;
};

// =====================================================
// ✅ NEW: Type for file browser items
// Previously: No file type definition
// Now: Structured file/folder data
// =====================================================
type FileItem = {
  name: string;
  type: "file" | "dir";
  size: number;
  path: string;
};
// =====================================================

function Cursor() {
  return <span className="animate-pulse text-green-400">█</span>;
}

export default function Terminal({
  chatId,
  onEnsureChat,
}: {
  chatId: string | null;
  onEnsureChat: () => Promise<string>;
  onSend: (content: string) => Promise<void>;
}) {
  const [messages, setMessages] = useState<TerminalMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // =====================================================
  // ✅ NEW: File browser state
  // Previously: No file browser
  // Now: Track current directory, files, and visibility
  // =====================================================
  const [currentDir, setCurrentDir] = useState<string>("");
  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [showFileBrowser, setShowFileBrowser] = useState<boolean>(true);
  // =====================================================

  const bufferRef = useRef<string[]>([]);
  const typingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const typeNextChar = () => {
    if (bufferRef.current.length === 0) {
      typingRef.current = false;
      return;
    }

    typingRef.current = true;
    const char = bufferRef.current.shift()!;

    console.log("⌨️ Typing char:", char);

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "agent" || !last.streaming) return prev;

      return [...prev.slice(0, -1), { ...last, content: last.content + char }];
    });

    setTimeout(typeNextChar, 15);
  };

  // =====================================================
  // ✅ NEW: Request directory listing from backend
  // Sends JSON message to get current folder contents
  // =====================================================
  const requestDirectoryListing = (path: string = ".") => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "list_dir",
        path: path
      }));
    }
  };
  // =====================================================

  // =====================================================
  // ✅ NEW: Navigation handler for file browser
  // Sends cd command and requests updated listing
  // =====================================================
  const handleNavigate = (target: string) => {
    if (!chatId) return;
    
    // Send cd command to agent
    sendMessage(`cd ${target}`, chatId);
    
    // Request updated directory listing after a short delay
    setTimeout(() => requestDirectoryListing("."), 500);
  };
  // =====================================================

  // =====================================================
  // ✅ NEW: File click handler - preview file contents
  // Sends cat command to display file in terminal
  // =====================================================
  const handleFileClick = (file: FileItem) => {
    if (!chatId) return;
    sendMessage(`cat ${file.name}`, chatId);
  };
  // =====================================================

  // =====================================================
  // ✅ NEW: Handle file upload
  // Allows users to upload files from their computer
  // =====================================================
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });
    
    try {
      setMessages(prev => [...prev, { role: "user", content: `$ Uploading ${files.length} file(s)...` }]);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessages(prev => [...prev, { 
          role: "agent", 
          content: `✅ Uploaded ${data.files.length} files to ${data.path}` 
        }]);
        
        // Update current directory and refresh file list
        if (data.path) {
          setCurrentDir(data.path);
          requestDirectoryListing(data.path);
          
          // Tell agent to use this directory
          if (chatId) {
            sendMessage(`cd ${data.path}`, chatId);
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "agent", content: `❌ Upload failed: ${err}` }]);
    }
    
    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  // =====================================================

  // =====================================================
  // ✅ NEW: Handle folder picker (browser support may vary)
  // =====================================================
  const handleFolderPicker = async () => {
    try {
      // @ts-ignore - Webkit API for directory picker
      const dirHandle = await window.showDirectoryPicker();
      alert(`Selected folder: ${dirHandle.name}\nPlease upload files using the upload button.`);
    } catch (err) {
      // User cancelled or browser doesn't support
      console.log("Folder picker cancelled or not supported");
    }
  };
  // =====================================================

  // =====================================================
  // 🔁 MODIFIED: Added socketRef to access raw WebSocket
  // Previously: Only had sendMessage, loadChat, isConnected
  // Now: Also have socketRef.current for JSON messages
  // =====================================================
  const { sendMessage, loadChat, isConnected, socketRef } = useWebSocket(
    (data: string) => {
      // =================================================
      // 🔁 MODIFIED: Handle both JSON and text messages
      // Previously: Only handled terminal output
      // Now: Parses JSON for file browser updates
      // =================================================
      
      // Try to parse as JSON first
      try {
        const jsonData = JSON.parse(data);
        
        // Handle directory listing from backend
        if (jsonData.type === "directory_list") {
          setCurrentDir(jsonData.current_dir);
          setFileList(jsonData.files);
          return; // Don't display in terminal
        }
        
        // Handle other JSON messages (chats, etc)
        if (jsonData.type === "chat_message") {
          // Handle chat messages if needed
          return;
        }
      } catch {
        // Not JSON, treat as regular terminal output
        console.log("🖥 Terminal received chunk:", data);

        const normalized = data.replace(/\r\n/g, "\n");
        bufferRef.current.push(...normalized.split(""));

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "agent" && last.streaming) return prev;

          return [...prev, { role: "agent", content: "", streaming: true }];
        });

        if (!typingRef.current) typeNextChar();
      }
    }
  );

  // Reset terminal when chat changes
  useEffect(() => {
    if (!chatId) return;
    setMessages([]);
    loadChat(chatId);
    
    // =================================================
    // ✅ NEW: Request directory listing when chat loads
    // =================================================
    setTimeout(() => requestDirectoryListing("."), 1000);
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // =================================================
  // 🔁 MODIFIED: Connection message
  // Previously: Only welcome message
  // Now: Also requests initial directory listing
  // =================================================
  useEffect(() => {
    if (isConnected) {
      console.log("Connected. Use file browser to navigate, then type commands.");
      
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: "✅ Connected. Use file browser to navigate, then type commands like 'create file', 'mkdir', etc." }
      ]);
      
      // Request initial directory listing
      setTimeout(() => requestDirectoryListing("."), 1000);
    }
  }, [isConnected]);

  const runCommand = async (command: string) => {
    let effectiveChatId = chatId;

    if (!effectiveChatId) {
      effectiveChatId = await onEnsureChat();
    }

    setMessages((prev) => [
      ...prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
      { role: "user", content: `$ ${command}` },
    ]);

    sendMessage(command, effectiveChatId);
    
    // =================================================
    // ✅ NEW: Refresh file browser after command
    // Commands like mkdir, touch, rm change files
    // =================================================
    setTimeout(() => requestDirectoryListing("."), 1000);
  };

  return (
    <div className="w-full max-w-4xl h-150 flex flex-col bg-black rounded-lg shadow-lg p-4">
      <h1 className="text-green-400 mb-2 font-bold">
        🖥️ OS Terminal Agent
      </h1>

      {/* ================================================= */}
      {/* ✅ NEW: File Browser Controls */}
      {/* Previously: No file browser controls */}
      {/* Now: Toggle, upload, and folder picker */}
      {/* ================================================= */}
      <div className="mb-2 flex gap-2 flex-wrap">
        <button
          onClick={() => setShowFileBrowser(!showFileBrowser)}
          className="text-xs bg-zinc-800 px-2 py-1 rounded hover:bg-zinc-700"
        >
          {showFileBrowser ? "📁 Hide Files" : "📁 Show Files"}
        </button>
        
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-xs bg-blue-600 px-3 py-1 rounded hover:bg-blue-700"
        >
          📤 Upload Files
        </button>
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          multiple
        />
        
        <button
          onClick={handleFolderPicker}
          className="text-xs bg-purple-600 px-3 py-1 rounded hover:bg-purple-700"
        >
          📁 Select Folder
        </button>
      </div>
      {/* ================================================= */}

      {/* ================================================= */}
      {/* ✅ NEW: File Browser Component */}
      {/* Previously: No file browser */}
      {/* Now: Visual file/folder navigation */}
      {/* ================================================= */}
      {showFileBrowser && (
        <FileBrowser
          currentDir={currentDir || "No directory selected"}
          files={fileList}
          onNavigate={handleNavigate}
          onFileClick={handleFileClick}
        />
      )}
      {/* ================================================= */}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-zinc-950 p-3 rounded text-sm font-mono whitespace-pre-wrap">
        {messages.length === 0 && (
          <div className="text-zinc-500">
            Connected. Use file browser to navigate, then type commands.
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={msg.role === "user" ? "text-green-400" : "text-zinc-200"}
          >
            {msg.content}
            {msg.streaming && <Cursor />}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input — centered & always visible */}
      <div className="mt-3 flex justify-center">
        <div className="w-full max-w-3xl">
          <InputBox onRun={runCommand} disabled={!isConnected} />
        </div>
      </div>
    </div>
  );
}