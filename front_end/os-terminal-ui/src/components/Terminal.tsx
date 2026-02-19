import { useState, useEffect, useRef } from "react";
import InputBox from "./InputBox";
import { useWebSocket } from "../hooks/useWebSocket";

type TerminalMessage = {
  role: "user" | "agent";
  content: string;
  streaming?: boolean;
};

function Cursor() {
  return <span className="animate-pulse text-green-400">█</span>;
}

export default function Terminal({
  chatId,
  onEnsureChat,
}: {
  chatId: string | null;
  onEnsureChat: () => Promise<string>;
  onSend: (content: string) => Promise<void>; // ✅ Add this
}) {
  const [messages, setMessages] = useState<TerminalMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const bufferRef = useRef<string[]>([]);
  const typingRef = useRef(false);

  const typeNextChar = () => {
    if (bufferRef.current.length === 0) {
      typingRef.current = false;
      return;
    }

    typingRef.current = true;
    const char = bufferRef.current.shift()!;

    // ✅ Log each character as it's typed
    console.log("⌨️ Typing char:", char);

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "agent" || !last.streaming) return prev;

      return [...prev.slice(0, -1), { ...last, content: last.content + char }];
    });

    setTimeout(typeNextChar, 15);
  };

  // 🔁 FIXED: Removed unused 'sendSetPath' from destructuring
  // Previously: const { sendMessage, sendSetPath, loadChat, isConnected } = useWebSocket(...)
  // Now: Only using what we need
  const { sendMessage, loadChat, isConnected } = useWebSocket(
    (data: string) => {
      // ✅ Log received chunk at the terminal level
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
  );

  // Reset terminal when chat changes
  useEffect(() => {
    if (!chatId) return;
    setMessages([]);
    loadChat(chatId);
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 🔁 REPLACED: Path prompt removed - now using relative paths only
  // Previously: useEffect with prompt for absolute path
  // Now: No path prompt - users will use 'cd' commands instead
  useEffect(() => {
    if (isConnected) {
      // ✅ NEW: No path prompt - users will navigate with 'cd' commands
      console.log("Connected. Use 'cd' to change directories, then regular commands.");
      
      // Optionally add a welcome message about using relative paths
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: "✅ Connected. Use 'cd' to navigate, then commands like 'mkdir', 'create file', etc." }
      ]);
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
};

  return (
    <div className="w-full max-w-4xl h-150 flex flex-col bg-black rounded-lg shadow-lg p-4">
      <h1 className="text-green-400 mb-2 font-bold">
        🖥️ OS Terminal Agent
      </h1>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-zinc-950 p-3 rounded text-sm font-mono whitespace-pre-wrap">
        {messages.length === 0 && (
          <div className="text-zinc-500">
            Connected. Type a command below.
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