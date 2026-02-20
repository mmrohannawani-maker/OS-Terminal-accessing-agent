import { useState, useEffect, useRef } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function SimpleBrowserMode() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I'm your browser mode assistant. How can I help you today?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // =====================================================
  // 🔁 FIXED: WebSocket connection with auto-reconnect
  // Previously: No reconnection logic
  // Now: Automatically reconnects on failure
  // =====================================================
  const wsRef = useRef<WebSocket | null>(null);
  // 🔁 FIXED: Using null instead of undefined for timeout ref
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectWebSocket = () => {
    // Determine WebSocket URL based on environment
    const wsUrl = window.location.protocol === 'https:'
        ? `wss://${window.location.host}/ws-browser`  // ← FIXED SPELLING
        : `ws://${window.location.host}/ws-browser`;  // ← FIXED SPELLING


    console.log('🔌 Connecting to WebSocket:', wsUrl);
    setConnectionStatus('connecting');
    
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    const ws = new WebSocket(wsUrl);
    
    // Set timeout for connection
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.log('⏱️ Connection timeout');
        ws.close();
        setConnectionStatus('disconnected');
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "⚠️ Connection timeout. Retrying..." 
        }]);
        // Try to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      }
    }, 10000);
    
    ws.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log("✅ WebSocket connected");
      setConnectionStatus('connected');
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "✅ Connected to research agent. I can search the web for information!" 
      }]);
    };
    
    ws.onmessage = (event) => {
      console.log("📨 Received:", event.data.substring(0, 50) + "...");
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: event.data 
      }]);
      setIsLoading(false);
    };
    
    ws.onerror = (error) => {
      console.error("❌ WebSocket error:", error);
      setConnectionStatus('disconnected');
      // Don't show error message immediately - let onclose handle reconnection
    };
    
    ws.onclose = (event) => {
      clearTimeout(connectionTimeout);
      console.log("🔌 WebSocket disconnected:", event.code, event.reason);
      setConnectionStatus('disconnected');
      
      // Try to reconnect if not closed normally (1000 = normal closure)
      if (event.code !== 1000) {
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "⚠️ Connection lost. Reconnecting..." 
        }]);
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      }
    };
    
    wsRef.current = ws;
  };

  // Connect to WebSocket on component mount
  useEffect(() => {
    connectWebSocket();
    
    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounting");
        wsRef.current = null;
      }
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // =====================================================
  // 🔁 MODIFIED: Handle send with WebSocket
  // =====================================================
  const handleSend = () => {
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || isLoading) return;
    
    // Add user message
    setMessages(prev => [...prev, { role: "user", content: input }]);
    
    // Send to WebSocket
    wsRef.current.send(input);
    setInput("");
    setIsLoading(true);
  };

  // =====================================================
  // ✅ NEW: Manual reconnect button
  // =====================================================
  const handleReconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    connectWebSocket();
  };

  return (
    <div className="max-w-4xl mx-auto bg-black rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-zinc-800">
        <span className="text-3xl">🌐</span>
        <h2 className="text-2xl font-bold text-blue-400">Browser Mode</h2>
        {/* ================================================= */}
        {/* 🔁 FIXED: Connection status indicator with more details */}
        {/* ================================================= */}
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded ${
            connectionStatus === 'connected' ? 'bg-green-600' :
            connectionStatus === 'connecting' ? 'bg-yellow-600' : 'bg-red-600'
          }`}>
            {connectionStatus === 'connected' ? 'Connected' :
             connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
          </span>
          {connectionStatus === 'disconnected' && (
            <button
              onClick={handleReconnect}
              className="text-xs bg-blue-600 px-2 py-1 rounded hover:bg-blue-700"
            >
              Reconnect
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="bg-zinc-950 rounded-lg p-4 mb-4 h-125 overflow-y-auto">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`mb-4 ${msg.role === "user" ? "text-right" : "text-left"}`}
          >
            <div
              className={`inline-block max-w-[80%] p-3 rounded-lg ${
                msg.role === "user"
                  ? "bg-green-600 text-white rounded-br-none"
                  : "bg-zinc-800 text-zinc-100 rounded-bl-none"
              }`}
            >
              {msg.content.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < msg.content.split('\n').length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}
        
        {/* Loading indicator */}
        {isLoading && (
          <div className="text-center text-blue-400 py-2">
            <span className="animate-pulse">●</span>
            <span className="animate-pulse animation-delay-200 mx-1">●</span>
            <span className="animate-pulse animation-delay-400">●</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type your message here..."
          disabled={connectionStatus !== 'connected' || isLoading}
          className="flex-1 bg-zinc-800 text-white border border-zinc-700 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-400 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || connectionStatus !== 'connected' || isLoading}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}