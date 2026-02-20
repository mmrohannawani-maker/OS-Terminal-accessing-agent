import { useEffect, useRef, useState } from "react";

// 🔁 REPLACED: Hardcoded WS_URL with dynamic URL from parameter
// Previously: const WS_URL = "ws://localhost:8000/ws";

type PendingResolver = (data: any) => void;

// 🔁 REPLACED: Now accepts URL parameter instead of hardcoded constant
// Previously: export function useWebSocket(onMessage: (data: string) => void) {
export function useWebSocket(
  onMessage: (data: string) => void,
  wsUrl?: string  // ✅ NEW: Optional URL parameter
) {
  const socketRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const pendingRef = useRef<Record<string, PendingResolver>>({});

  useEffect(() => {
    // =====================================================
    // 🔁 FIXED: Better URL detection for both modes
    // Previously: Used auto-detection with unused variables
    // Now: Simplified and removed unused code
    // =====================================================
    
    // Determine the base URL
    // 1. Use explicitly passed URL (highest priority)
    // 2. Use environment variable
    // 3. Fallback to localhost for development
    
    let url = wsUrl;
    
    if (!url) {
      // Check for environment variable
      url = import.meta.env.VITE_WS_URL;
    }
    
    if (!url) {
      // 🔁 FIXED: Removed unused protocol/host variables
      // For development fallback
      if (import.meta.env.DEV) {
        url = 'ws://localhost:8000/ws';  // Default for terminal mode
      } else {
        // In production, we need the component to pass the full URL
        // because we don't know if it's terminal or browser mode
        console.error("❌ No WebSocket URL provided in production");
        return;
      }
    }
    
    console.log(`🔌 Connecting to WebSocket: ${url}`);
    
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("✅ WebSocket connected");
      setIsConnected(true);
    };
    
    socket.onclose = () => {
      console.log("🔌 WebSocket disconnected");
      setIsConnected(false);
    };
    
    socket.onerror = (error) => {
      console.error("❌ WebSocket error:", error);
      setIsConnected(false);
    };

    socket.onmessage = (event) => {

      // ✅ Log raw WS message from backend
      console.log("💬 WS raw message received:", event.data);

      try {
        

        const data = JSON.parse(event.data);

        // ✅ Log if this is a JSON response with requestId
        if (data.requestId) {
        console.log("📌 WS JSON with requestId:", data);
        }

        if (data.requestId && pendingRef.current[data.requestId]) {
          pendingRef.current[data.requestId](data);
          delete pendingRef.current[data.requestId];
          return;
        }
      } catch {
        // Non-JSON streaming message
        console.log("📥 Non-JSON streaming chunk:", event.data);
        // non-JSON streaming message
      }
      // ✅ Log just before calling onMessage callback
      console.log("▶ Passing to onMessage callback:", event.data);
      

      onMessage(event.data);
    };

    return () => socket.close();
  }, [wsUrl]); // ✅ NEW: Added wsUrl to dependency array

  /* ✅ NEW: wait until socket is OPEN */
  const waitForOpen = async () => {
    while (
      !socketRef.current ||
      socketRef.current.readyState !== WebSocket.OPEN
    ) {
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  /* 🔄 MODIFIED send */
  const send = async (payload: any) => {
    await waitForOpen();
    socketRef.current?.send(JSON.stringify(payload));
  };

  const sendMessage = (content: string, chatId: string) => {
    send({ type: "message", chat_id: chatId, content });
  };

  const sendSetPath = (path: string) => {
    socketRef.current?.send(`setpath ${path}`);
  };

  const createChat = () =>
    new Promise<{ id: string; title: string }>((resolve) => {
      const requestId = crypto.randomUUID();
      pendingRef.current[requestId] = (data) => resolve(data);
      send({ type: "new_chat", requestId });
    });

  const listChats = () =>
    new Promise<{ id: string; title: string }[]>((resolve) => {
      const requestId = crypto.randomUUID();
      pendingRef.current[requestId] = (data) => resolve(data.chats);
      send({ type: "list_chats", requestId });
    });

  const loadChat = (chatId: string) => {
    send({ type: "load_chat", chat_id: chatId });
  };

  // ✅ NEW: Delete a chat by chatId
  const deleteChat = (chatId: string) => {
    send({ type: "delete_chat", chat_id: chatId });
  };

  // ✅ NEW: Rename a chat by chatId
  const renameChat = (chatId: string, newTitle: string) => {
    send({ type: "rename_chat", chat_id: chatId, title: newTitle });
  };

  return {
    sendMessage,
    sendSetPath,
    createChat,
    listChats,
    loadChat,
    deleteChat,     // ✅ added
    renameChat,     // ✅ added
    isConnected,
    socketRef  // ✅ Add this

  };
}