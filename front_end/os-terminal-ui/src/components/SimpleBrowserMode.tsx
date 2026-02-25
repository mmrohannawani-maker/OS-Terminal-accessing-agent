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
  // ✅ NEW: Sources state for citation tooltips
  // Previously: No sources tracking
  // Now: Stores source URLs by citation number
  // =====================================================
  const [sources, setSources] = useState<{[key: string]: string}>({});
  // =====================================================

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
  // 🔁 FIXED: Function to render text with clickable citations
  // Previously: Citations showed tooltips only
  // Now: Citations are clickable links that open URLs directly
  // =====================================================
  const renderMessageWithCitations = (text: string) => {
    // Split by citation patterns [1], [2], [3] (with spaces)
    console.log("🔍 RENDERING TEXT:", text);
    console.log("🔍 CURRENT SOURCES DICTIONARY:", sources);
    const parts = text.split(/(\[\s*\d+\s*\])/g);
    console.log("🔍 SPLIT PARTS:", parts);
  
    return parts.map((part, index) => {
      // Check if this part is a citation like [1]
      const citationMatch = part.match(/\[\s*(\d+)\s*\]/);
    
      if (citationMatch) {
        const citationNum = citationMatch[1];
        const url = sources[citationNum];

        console.log(`🔍 FOUND CITATION [${citationNum}] → URL:`, url);
        console.log(`🔍 URL EXISTS?`, !!url);
      
        if (!url) {
          return <span key={index} className="text-gray-500">{part}</span>;
        }
      
        return (
          <span 
            key={index} 
            className="relative inline-block group"
          >
            {/* Clickable blue underlined number */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-800 font-medium cursor-pointer mx-0.5"
            >
              {part}
            </a>
          
            {/* Tooltip with clickable link on hover */}
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-800 text-white text-xs py-2 px-3 rounded-lg whitespace-nowrap z-50 shadow-lg min-w-50">
              <a 
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-300 hover:text-blue-100 underline block "
                title={url}
              >
                {url}
              </a>
              {/* Tooltip arrow */}
              <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-800"></span>
            </span>
          </span>
        );
      }
    
      // Regular text
      return <span key={index}>{part}</span>;
    });
  };
  // =====================================================

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
        ? 'https://os-terminal-accessing-agent-production.up.railway.app'
        : 'http://localhost:8000';
      
      const url = `${baseUrl}/api/browser/chat`;
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
      console.log("🔵 RAW RESPONSE DATA:", JSON.stringify(data, null, 2));
      console.log("🔵 RESPONSE TEXT:", data.response);
      console.log("🔵 SOURCES DICTIONARY:", data.sources);
      
      if (data.error) {
        console.log("🔴 [BROWSER] Error in response:", data.error);
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: `❌ Error: ${data.error}` 
        }]);
      } else {
        console.log("✅ [BROWSER] Success! Response length:", data.response?.length);
        
        // =================================================
        // 🔁 FIXED: Handle tuple format from backend
        // Previously: Expected simple response
        // Now: Handles array format [text, sources_dict]
        // =================================================
        if (Array.isArray(data.response)) {
          // It's a tuple: [response_text, sources_dict]
          const [responseText, sourcesDict] = data.response;
          
          console.log("📚 [BROWSER] Sources received (tuple):", sourcesDict);
          setSources(sourcesDict);
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: responseText 
          }]);
        } else if (data.sources) {
          // Separate fields format
          console.log("📚 [BROWSER] Sources received (separate):", data.sources);
          setSources(data.sources);
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: data.response 
          }]);
        } else {
          // Plain text response
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: data.response 
          }]);
        }
        // =================================================
      }
    } catch (error) {
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
              {/* ================================================= */}
              {/* 🔁 FIXED: Always use citations renderer for ALL messages */}
              {/* Previously: Only used for last message with sources */}
              {/* Now: Always tries to render citations, falls back gracefully */}
              {/* ================================================= */}
              <div className="whitespace-pre-wrap wrap-break-word">
                {renderMessageWithCitations(msg.content)}
              </div>
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
