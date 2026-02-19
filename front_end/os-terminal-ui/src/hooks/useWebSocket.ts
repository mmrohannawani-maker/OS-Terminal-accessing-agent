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
    // ✅ NEW: Determine WebSocket URL with priority:
    // 1. Parameter passed to function
    // 2. Vite environment variable (for production)
    // 3. Localhost fallback (for development)
    const url = wsUrl || 
                import.meta.env.VITE_WS_URL || 
                "ws://localhost:8000/ws";
    
    console.log(`🔌 Connecting to WebSocket: ${url}`); // ✅ NEW: Log connection URL
    
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => setIsConnected(true);
    socket.onclose = () => setIsConnected(false);
    socket.onerror = () => setIsConnected(false);

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
  };
}