// =====================================================
// 🔁 FIXED: Removed unused React import
// Previously: import React from "react";
// Now: No import needed
// =====================================================
type Mode = "terminal" | "browser";

interface ModeSelectorProps {
  currentMode: Mode;
  onModeChange: (mode: Mode) => void;
}

export default function ModeSelector({ currentMode, onModeChange }: ModeSelectorProps) {
  return (
    // =================================================
    // 🔁 FIXED: Removed conflicting CSS classes
    // Previously: flex + inline-block conflict
    // Now: Only flex with proper alignment
    // =================================================
    <div className="flex gap-2 p-1 bg-zinc-800 rounded-lg">
      <button
        onClick={() => onModeChange("terminal")}
        className={`px-4 py-2 rounded-md transition-colors ${
          currentMode === "terminal"
            ? "bg-green-600 text-white"
            : "text-zinc-400 hover:text-white hover:bg-zinc-700"
        }`}
      >
        🖥️ Terminal Mode
      </button>
      <button
        onClick={() => onModeChange("browser")}
        className={`px-4 py-2 rounded-md transition-colors ${
          currentMode === "browser"
            ? "bg-blue-600 text-white"
            : "text-zinc-400 hover:text-white hover:bg-zinc-700"
        }`}
      >
        🌐 Browser Mode
      </button>
    </div>
  );
}