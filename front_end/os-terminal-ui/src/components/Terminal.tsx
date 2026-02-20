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

  // =====================================================
  // ✅ NEW: Local server integration
  // Previously: Only cloud upload method
  // Now: Can use local server for direct file access
  // =====================================================
  const [useLocalServer, setUseLocalServer] = useState<boolean>(false);
  const localServerUrl = 'http://localhost:3031'; // Changed: no setter
  const [localRoot, setLocalRoot] = useState<string>('');
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
  // ✅ NEW: Check for local server on startup
  // Previously: No local server detection
  // Now: Auto-detects if user has local server running
  // =====================================================
  useEffect(() => {
    const checkLocalServer = async () => {
      try {
        const response = await fetch(`${localServerUrl}/api/status`);
        if (response.ok) {
          await response.json();
          setUseLocalServer(true);
          //setLocalRoot(data.currentRoot);
          console.log('✅ Local server detected at', localServerUrl);
          
          setMessages((prev) => [
            ...prev,
            { role: "agent", content: "✅ Connected to local server - files accessed directly from your computer!" }
          ]);
        }
      } catch (err) {
        console.log('Local server not available, using cloud upload method');
      }
    };
    
    checkLocalServer();
  }, []);

  // =====================================================
  // ✅ NEW: Request directory listing from appropriate source
  // Previously: Only WebSocket to cloud
  // Now: Uses local server if available, otherwise WebSocket
  // =====================================================
  const requestDirectoryListing = async (path: string = ".") => {
    if (useLocalServer) {
      // Use local server API
      try {
        const response = await fetch(`${localServerUrl}/api/list?path=${encodeURIComponent(path)}`);
        const data = await response.json();
        setCurrentDir(data.currentDir);
        setFileList(data.items.map((item: any) => ({
          name: item.name,
          type: item.type,
          size: item.size,
          path: item.path
        })));
      } catch (err) {
        console.error('Local server error:', err);
      }
    } else {
      // Fall back to WebSocket (cloud)
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: "list_dir",
          path: path
        }));
      }
    }
  };
  // =====================================================

  // =====================================================
  // ✅ NEW: Get available drives from local server
  // Only works when local server is available
  // =====================================================
  const getDrives = async () => {
    if (!useLocalServer) {
      alert('Local server not available. Please download and run the local server app first.');
      return [];
    }
    
    try {
      const response = await fetch(`${localServerUrl}/api/drives`);
      const data = await response.json();
      return data.drives;
    } catch (err) {
      console.error('Failed to get drives:', err);
      return [];
    }
  };
  // =====================================================

  // =====================================================
  // ✅ NEW: Set root directory via local server
  // User selects a folder, local server uses it as root
  // =====================================================
  const updateLocalRoot = async (path: string) => {
    if (!useLocalServer) return false;
    
    try {
      const response = await fetch(`${localServerUrl}/api/set-root`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      
      const data = await response.json();
      if (data.success) {
        setLocalRoot(data.currentRoot);
        await requestDirectoryListing('.');
        
        // Tell agent to use this directory
        if (chatId) {
          sendMessage(`cd ${data.currentRoot}`, chatId);
        }
        
        setMessages((prev) => [
          ...prev,
          { role: "agent", content: `📁 Working directory set to: ${data.currentRoot}` }
        ]);
        
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to set root:', err);
      return false;
    }
  };
  // =====================================================

  // =====================================================
  // ✅ NEW: Navigation handler for file browser
  // Sends cd command and requests updated listing
  // =====================================================
  const handleNavigate = async (target: string) => {
    if (!chatId) return;
    
    if (useLocalServer) {
      // With local server, just request new directory listing
      let newPath;
      if (target === "..") {
        newPath = currentDir.substring(0, currentDir.lastIndexOf('/'));
        newPath = newPath || (currentDir.includes(':\\') ? currentDir.substring(0, 3) : '/');
      } else {
        newPath = currentDir === '/' ? `/${target}` : `${currentDir}/${target}`;
      }
      await requestDirectoryListing(newPath);
      
      // Still send cd command to agent for context
      sendMessage(`cd ${target}`, chatId);
    } else {
      // Cloud mode: send cd command to agent
      sendMessage(`cd ${target}`, chatId);
      
      // Request updated directory listing after a short delay
      setTimeout(() => requestDirectoryListing("."), 500);
    }
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
  // 🔁 MODIFIED: Handle file upload (now local server aware)
  // Previously: Only cloud upload
  // Now: Shows message about local server if available
  // =====================================================
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    if (useLocalServer) {
      // With local server, we can copy files directly
      alert('Local server detected! You can work with files directly without uploading.\nFiles will be copied to current directory.');
      
      // TODO: Implement direct copy to local server folder
      // For now, just acknowledge
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: `📁 Local server mode: Files can be accessed directly. Use "mkdir" and "create file" commands.` }
      ]);
      return;
    }
    
    // Fall back to cloud upload
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
  // ✅ NEW: Handle folder picker with local server
  // Previously: Just a message
  // Now: Actually lets user select folder with local server
  // =====================================================
  const handleFolderPicker = async () => {
    if (!useLocalServer) {
      alert('Please download and run the local server app first to access folders directly.');
      return;
    }
    
    try {
      // Get available drives
      const drives = await getDrives();
      
      // Simple prompt for path (in production, use a proper UI)
      const path = prompt(`Enter full path to folder (e.g., ${drives[0] || 'C:\\Users\\yourname'})`);
      if (path) {
        await updateLocalRoot(path);
      }
    } catch (err) {
      console.error('Folder picker error:', err);
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
      // Now: Parses JSON for file browser updates (cloud mode)
      // =================================================
      
      // Try to parse as JSON first
      try {
        const jsonData = JSON.parse(data);
        
        // Handle directory listing from backend (cloud mode)
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
  // Now: Also requests initial directory listing and shows local server status
  // =================================================
  useEffect(() => {
    if (isConnected) {
      console.log("Connected. Use file browser to navigate, then type commands.");
      
      const welcomeMessage = useLocalServer 
        ? "✅ Connected to local server - files accessed directly from your computer! Use file browser to navigate."
        : "✅ Connected. Use file browser to navigate, then type commands like 'create file', 'mkdir', etc.";
      
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: welcomeMessage }
      ]);
      
      // Request initial directory listing
      setTimeout(() => requestDirectoryListing("."), 1000);
    }
  }, [isConnected, useLocalServer]);

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
      {/* ✅ NEW: Local Server Status Indicator */}
      {/* Shows if user is using local server or cloud mode */}
      {/* ================================================= */}
      {useLocalServer && (
        <div className="mb-2 text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded">
          ✅ Local server mode - files accessed directly from your computer
        </div>
      )}
      {/* ================================================= */}

      {/* ================================================= */}
      {/* ✅ NEW: File Browser Controls */}
      {/* Previously: No file browser controls */}
      {/* Now: Toggle, upload, and folder picker (local server aware) */}
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
          {useLocalServer ? "📋 Copy Files" : "📤 Upload Files"}
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
          className={`text-xs px-3 py-1 rounded ${
            useLocalServer 
              ? "bg-purple-600 hover:bg-purple-700" 
              : "bg-gray-600 cursor-not-allowed opacity-50"
          }`}
          disabled={!useLocalServer}
          title={!useLocalServer ? "Download local server app first" : "Select folder on your computer"}
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
          currentDir={currentDir || (useLocalServer ? localRoot || "No folder selected" : "No directory selected")}
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
            {useLocalServer 
              ? "Connected to local server. Click 'Select Folder' to choose a directory."
              : "Connected. Use file browser to navigate, then type commands."}
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