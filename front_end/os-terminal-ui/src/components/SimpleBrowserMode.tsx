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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // =====================================================
  // ✅ NEW: WebSocket connection for research agent
  // Previously: Used setTimeout echo responses
  // Now: Connects to real backend agent
  // =====================================================
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to WebSocket on component mount
  useEffect(() => {
    // Determine WebSocket URL based on environment
    const wsUrl = window.location.protocol === 'https:'
  ? `wss://${window.location.host}/ws-browser`  // ← Must be /ws-browser
  : `ws://${window.location.host}/ws-browser`;
    
    console.log("🔌 Connecting to WebSocket:", wsUrl);
    
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onopen = () => {
      console.log("✅ WebSocket connected");
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "✅ Connected to research agent. I can search the web for information!" 
      }]);
    };
    
    wsRef.current.onmessage = (event) => {
      console.log("📨 Received:", event.data);
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: event.data 
      }]);
      setIsLoading(false);
    };
    
    wsRef.current.onerror = (error) => {
      console.error("❌ WebSocket error:", error);
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "❌ Connection error. Please refresh the page." 
      }]);
      setIsLoading(false);
    };
    
    wsRef.current.onclose = () => {
      console.log("🔌 WebSocket disconnected");
    };
    
    // Cleanup on unmount
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // =====================================================
  // 🔁 MODIFIED: Handle send with WebSocket
  // Previously: Echo response with setTimeout
  // Now: Sends message to real backend agent
  // =====================================================
  const handleSend = () => {
    if (!input.trim() || !wsRef.current || isLoading) return;
    
    // Add user message
    setMessages(prev => [...prev, { role: "user", content: input }]);
    
    // Send to WebSocket
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
        {/* ================================================= */}
        {/* ✅ NEW: Connection status indicator */}
        {/* ================================================= */}
        <div className="ml-auto">
          <span className={`text-xs px-2 py-1 rounded ${
            wsRef.current?.readyState === WebSocket.OPEN 
              ? 'bg-green-600' 
              : 'bg-red-600'
          }`}>
            {wsRef.current?.readyState === WebSocket.OPEN ? 'Connected' : 'Disconnected'}
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
              {/* ================================================= */}
              {/* ✅ IMPROVED: Better message formatting with line breaks */}
              {/* ================================================= */}
              {msg.content.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < msg.content.split('\n').length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}
        
        {/* ================================================= */}
        {/* ✅ NEW: Loading indicator */}
        {/* ================================================= */}
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
          disabled={!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || isLoading}
          className="flex-1 bg-zinc-800 text-white border border-zinc-700 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-400 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || isLoading}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}