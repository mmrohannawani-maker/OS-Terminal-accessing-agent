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
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // =====================================================
  // 🔁 FIXED: Single connection attempt - no retries
  // Previously: Auto-reconnected on failure
  // Now: Shows error and stops trying
  // =====================================================
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Determine WebSocket URL based on environment
    const wsUrl = import.meta.env.PROD
        ? 'wss://vibrant-patience-production-68b7.up.railway.app/ws-browser'  // ← NEW DOMAIN
        : 'ws://localhost:8000/ws-browser';

    console.log('🔌 Connecting to WebSocket:', wsUrl);
    
    const ws = new WebSocket(wsUrl);
    
    // Set timeout for connection
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.log('⏱️ Connection timeout');
        ws.close();
        setConnectionStatus('failed');
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "⚠️ Failed to connect to research agent. Please refresh the page." 
        }]);
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
      setConnectionStatus('failed');
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "❌ Connection failed. Please refresh the page." 
      }]);
    };
    
    ws.onclose = (event) => {
      clearTimeout(connectionTimeout);
      console.log("🔌 WebSocket disconnected:", event.code, event.reason);
      if (connectionStatus === 'connecting') {
        setConnectionStatus('failed');
      }
    };
    
    wsRef.current = ws;

    // Cleanup on unmount
    return () => {
      clearTimeout(connectionTimeout);
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounting");
      }
    };
  }, []); // Empty dependency array = runs once

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || isLoading) return;
    
    setMessages(prev => [...prev, { role: "user", content: input }]);
    wsRef.current.send(input);
    setInput("");
    setIsLoading(true);
  };

  return (
    <div className="max-w-4xl mx-auto bg-black rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-zinc-800">
        <span className="text-3xl">🌐</span>
        <h2 className="text-2xl font-bold text-blue-400">Browser Mode</h2>
        {/* Connection Status Indicator */}
        <div className="ml-auto">
          <span className={`text-xs px-2 py-1 rounded ${
            connectionStatus === 'connected' ? 'bg-green-600' :
            connectionStatus === 'connecting' ? 'bg-yellow-600' : 'bg-red-600'
          }`}>
            {connectionStatus === 'connected' ? 'Connected' :
             connectionStatus === 'connecting' ? 'Connecting...' : 'Connection Failed'}
          </span>
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