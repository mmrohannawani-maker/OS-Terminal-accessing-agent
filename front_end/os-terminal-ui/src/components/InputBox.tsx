import { useState } from "react";

interface InputBoxProps {
  onRun: (command: string) => void;
  disabled: boolean;
}

export default function InputBox({ onRun, disabled }: InputBoxProps) {
  const [value, setValue] = useState("");

  return (
    <div className="mt-3 flex gap-2">
      <input
        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 outline-none"
        placeholder="Enter command..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onRun(value);
            setValue("");
          }
        }}
      />

      <button
        className="bg-green-600 px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
        onClick={() => {
          if (value.trim()) {
            onRun(value);
            setValue("");
          }
        }}
        disabled={disabled}
      >
        Run
      </button>
    </div>
  );
}
