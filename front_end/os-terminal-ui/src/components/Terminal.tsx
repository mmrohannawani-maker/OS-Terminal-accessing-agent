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
  // 🔁 FIXED: Local server integration - disabled in production
  // Previously: Tried to connect to localhost in production
  // Now: Local server only available in development
  // =====================================================
  const [useLocalServer, setUseLocalServer] = useState<boolean>(!import.meta.env.PROD);
  const localServerUrl = !import.meta.env.PROD ? 'http://localhost:3031' : null;
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
  // 🔁 FIXED: Local server check - skipped in production
  // Previously: Always tried to connect
  // Now: Only checks in development
  // =====================================================
  useEffect(() => {
    // Skip local server check in production
    if (import.meta.env.PROD) {
      setUseLocalServer(false);
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: "⚠️ Running in cloud mode. Use file uploads or create files directly." }
      ]);
      return;
    }
    
    const checkLocalServer = async () => {
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          const response = await fetch(`${localServerUrl}/api/status`, {
            signal: AbortSignal.timeout(2000)
          });
          
          if (response.ok) {
            await response.json();
            setUseLocalServer(true);
            console.log('✅ Local server detected at', localServerUrl);
            
            setMessages((prev) => [
              ...prev,
              { role: "agent", content: "✅ Connected to local server - files accessed directly from your computer! Click 'Select Folder' to choose a directory." }
            ]);
            
            // Try to get initial drives
            try {
              const drivesResponse = await fetch(`${localServerUrl}/api/drives`);
              if (drivesResponse.ok) {
                const drivesData = await drivesResponse.json();
                console.log('📁 Available drives:', drivesData.drives);
              }
            } catch (drivesErr) {
              console.log('Could not fetch drives, but continuing');
            }
            
            return;
          }
        } catch (err) {
          console.log(`Local server check attempt ${attempts + 1} failed`);
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log('Local server not available');
      setUseLocalServer(false);
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: "⚠️ Local server not detected. Using cloud mode with file uploads." }
      ]);
    };
    
    checkLocalServer();
  }, []);

  // =====================================================
  // 🔁 FIXED: Request directory listing - handles production mode
  // Previously: Always tried local server
  // Now: Uses WebSocket in production, local server in dev
  // =====================================================
  const requestDirectoryListing = async (path: string = ".") => {
    if (useLocalServer && localServerUrl) {
      // Use local server API (development only)
      try {
        const response = await fetch(`${localServerUrl}/api/list?path=${encodeURIComponent(path)}`);
        if (response.ok) {
          const data = await response.json();
          setCurrentDir(data.currentDir);
          setFileList(data.items.map((item: any) => ({
            name: item.name,
            type: item.type,
            size: item.size,
            path: item.path
          })));
        } else {
          console.error('Local server returned error:', response.status);
        }
      } catch (err) {
        console.error('Local server error:', err);
        // Fallback to WebSocket
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: "list_dir",
            path: path
          }));
        }
      }
    } else {
      // Use WebSocket (cloud mode - production)
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
  // 🔁 FIXED: Get drives - only in development
  // =====================================================
  const getDrives = async () => {
    if (!useLocalServer || !localServerUrl) {
      return [];
    }
    
    try {
      const response = await fetch(`${localServerUrl}/api/drives`, {
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        const data = await response.json();
        return data.drives || [];
      }
      return [];
    } catch (err) {
      console.error('Failed to get drives:', err);
      return [];
    }
  };
  // =====================================================

  // =====================================================
  // 🔁 FIXED: Update local root - only in development
  // =====================================================
  const updateLocalRoot = async (path: string) => {
    if (!useLocalServer || !localServerUrl) {
      alert('Local server only available in development mode.');
      return false;
    }
    
    try {
      const response = await fetch(`${localServerUrl}/api/set-root`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
        signal: AbortSignal.timeout(5000)
      });
      
      const data = await response.json();
      if (data.success) {
        setLocalRoot(data.currentRoot);
        await requestDirectoryListing('.');
        
        if (chatId) {
          sendMessage(`cd ${data.currentRoot}`, chatId);
        }
        
        setMessages((prev) => [
          ...prev,
          { role: "agent", content: `📁 Working directory set to: ${data.currentRoot}` }
        ]);
        
        return true;
      } else {
        alert('Failed to set folder: ' + (data.error || 'Unknown error'));
        return false;
      }
    } catch (err) {
      console.error('Failed to set root:', err);
      alert('Error connecting to local server. Make sure it\'s running on port 3031.');
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
    
    if (useLocalServer && localServerUrl) {
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
  // 🔁 MODIFIED: Handle file upload (now production aware)
  // Previously: Tried local server in production
  // Now: Uses cloud upload in production
  // =====================================================
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    if (useLocalServer && localServerUrl) {
      // Development mode with local server
      const targetPath = prompt('Enter destination path (relative to current directory):', '.');
      if (targetPath) {
        setMessages((prev) => [
          ...prev,
          { role: "agent", content: `📋 File copy not yet implemented. Use 'create file' command instead.` }
        ]);
      }
      return;
    }
    
    // Cloud upload (production)
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
        
        if (data.path) {
          setCurrentDir(data.path);
          requestDirectoryListing(data.path);
          
          if (chatId) {
            sendMessage(`cd ${data.path}`, chatId);
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "agent", content: `❌ Upload failed: ${err}` }]);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  // =====================================================

  // =====================================================
  // 🔁 FIXED: Handle folder picker - production aware
  // Previously: Always tried local server
  // Now: Cloud mode in production
  // =====================================================
  const handleFolderPicker = async () => {
    try {
      if (useLocalServer && localServerUrl) {
        // Development mode - local server
        let drives: string[] = [];
        let localServerAvailable = false;
        
        try {
          const response = await fetch(`${localServerUrl}/api/status`, {
            signal: AbortSignal.timeout(2000)
          });
          localServerAvailable = response.ok;
          
          if (localServerAvailable) {
            const drivesData = await getDrives();
            drives = drivesData;
          }
        } catch (err) {
          console.log('Local server not available');
        }
        
        if (localServerAvailable) {
          const defaultPath = drives.length > 0 ? drives[0] : 'C:\\';
          const path = prompt('Enter full path to folder:', defaultPath);
          
          if (path) {
            await updateLocalRoot(path);
          }
        }
      } else {
        // Production mode - cloud
        const choice = prompt(
          'Cloud mode - choose action:\n' +
          '1: Upload files\n' +
          '2: Create new folder'
        );
        
        if (choice === '1') {
          fileInputRef.current?.click();
        } else if (choice === '2') {
          const folderName = prompt('Enter folder name to create:', 'myfolder');
          if (folderName) {
            sendMessage(`mkdir ${folderName}`, chatId!);
            setTimeout(() => requestDirectoryListing("."), 1000);
          }
        }
      }
    } catch (err) {
      console.error('Folder picker error:', err);
      alert('Error in folder picker. Check console for details.');
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
          return;
        }
        
        if (jsonData.type === "chat_message") {
          return;
        }
      } catch {
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
    
    setTimeout(() => requestDirectoryListing("."), 1000);
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // =================================================
  // 🔁 MODIFIED: Connection message - production aware
  // =================================================
  useEffect(() => {
    if (isConnected) {
      console.log("Connected. Use file browser to navigate, then type commands.");
      
      const welcomeMessage = useLocalServer 
        ? "✅ Connected to local server - files accessed directly from your computer! Click 'Select Folder' to choose a directory."
        : "✅ Connected to cloud. Use file browser to navigate, then type commands.";
      
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: welcomeMessage }
      ]);
      
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
    
    setTimeout(() => requestDirectoryListing("."), 1000);
  };

  return (
    <div className="w-full max-w-4xl h-150 flex flex-col bg-black rounded-lg shadow-lg p-4">
      <h1 className="text-green-400 mb-2 font-bold">
        🖥️ OS Terminal Agent
      </h1>

      {/* ================================================= */}
      {/* ✅ NEW: Local Server Status Indicator */}
      {/* ================================================= */}
      {useLocalServer && (
        <div className="mb-2 text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded">
          ✅ Local server mode - files accessed directly from your computer
        </div>
      )}
      {/* ================================================= */}

      {/* ================================================= */}
      {/* ✅ NEW: File Browser Controls */}
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
          className="text-xs bg-purple-600 px-3 py-1 rounded hover:bg-purple-700"
        >
          📁 Select Folder
        </button>
      </div>
      {/* ================================================= */}

      {/* ================================================= */}
      {/* ✅ NEW: File Browser Component */}
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
              : "Connected to cloud. Use file browser to navigate, then type commands."}
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