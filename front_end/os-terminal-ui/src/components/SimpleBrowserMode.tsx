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
  // 🔁 REPLACED: HTTP session ID instead of WebSocket
  // Previously: WebSocket connection with ref
  // Now: Simple session ID for tracking conversations
  // =====================================================
  const [sessionId] = useState(() => crypto.randomUUID());
  // =====================================================

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // =====================================================
  // 🔁 REPLACED: HTTP fetch instead of WebSocket send
  // Previously: WebSocket connection with timeout and retries
  // Now: Simple POST request - no connection management needed
  // =====================================================
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    // Add user message immediately
    const userMessage = input;
    console.log("🔵 [BROWSER] Sending message:", userMessage);
    console.log("🔵 [BROWSER] Session ID:", sessionId);
    
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    setIsLoading(true);
    
    try {
      // Determine the correct URL based on environment
      const baseUrl = import.meta.env.PROD 
        ? 'https://vibrant-patience-production-68b7.up.railway.app'
        : '';
      
      const url = `${baseUrl}/api/browser/chat`;  // ← New path
      console.log("🔵 [BROWSER] Fetch URL:", url);
      
      const requestBody = {
        message: userMessage,
        session_id: sessionId
      };
      console.log("🔵 [BROWSER] Request body:", requestBody);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log("🔵 [BROWSER] Response status:", response.status);
      console.log("🔵 [BROWSER] Response OK:", response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log("🔴 [BROWSER] Error response text:", errorText);
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log("🔵 [BROWSER] Response data:", data);
      
      if (data.error) {
        console.log("🔴 [BROWSER] Error in response:", data.error);
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: `❌ Error: ${data.error}` 
        }]);
      } else {
        console.log("✅ [BROWSER] Success! Response length:", data.response?.length);
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: data.response 
        }]);
      }
    } catch (error) {
      // 🔁 FIXED: Type assertion for error
      const err = error as Error;
      console.error("🔴 [BROWSER] Fetch error:", err);
      console.error("🔴 [BROWSER] Error details:", {
        name: err.name,
        message: err.message,
        stack: err.stack
      });
      
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "❌ Failed to connect to server. Please try again." 
      }]);
    } finally {
      setIsLoading(false);
    }
  };
  // =====================================================

  return (
    <div className="max-w-4xl mx-auto bg-black rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-zinc-800">
        <span className="text-3xl">🌐</span>
        <h2 className="text-2xl font-bold text-blue-400">Browser Mode</h2>
        {/* ================================================= */}
        {/* ✅ NEW: Simple status indicator - always "Connected" with HTTP */}
        {/* ================================================= */}
        <div className="ml-auto">
          <span className="text-xs bg-green-600 px-2 py-1 rounded">
            HTTP Mode
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
          disabled={isLoading}
          className="flex-1 bg-zinc-800 text-white border border-zinc-700 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-400 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}