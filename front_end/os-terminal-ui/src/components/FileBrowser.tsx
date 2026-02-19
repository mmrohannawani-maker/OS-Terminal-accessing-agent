import { useState } from "react";

// =====================================================
// Type definition for file/folder items
// Matches the structure sent from backend
// =====================================================
type FileItem = {
  name: string;
  type: "file" | "dir";
  size: number;
  path: string;
};

// =====================================================
// Props interface for the FileBrowser component
// =====================================================
type FileBrowserProps = {
  currentDir: string;
  files: FileItem[];
  onNavigate: (path: string) => void;
  onFileClick?: (file: FileItem) => void;
};

export default function FileBrowser({ 
  currentDir, 
  files, 
  onNavigate, 
  onFileClick 
}: FileBrowserProps) {
  
  // =====================================================
  // State for sorting and view options
  // =====================================================
  const [sortBy, setSortBy] = useState<"name" | "type" | "size">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // =====================================================
  // Format file size to human-readable format
  // Example: 1024 → "1.0 KB", 1048576 → "1.0 MB"
  // =====================================================
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // =====================================================
  // Sort files based on current sort settings
  // Directories always come before files
  // Then sort by selected criteria
  // =====================================================
  const sortedFiles = [...files].sort((a, b) => {
    // Directories first
    if (a.type !== b.type) {
      return a.type === "dir" ? -1 : 1;
    }
    
    // Then sort by selected criteria
    let comparison = 0;
    if (sortBy === "name") {
      comparison = a.name.localeCompare(b.name);
    } else if (sortBy === "size" && a.type === "file" && b.type === "file") {
      comparison = a.size - b.size;
    } else if (sortBy === "type") {
      const extA = a.name.split('.').pop() || '';
      const extB = b.name.split('.').pop() || '';
      comparison = extA.localeCompare(extB);
    }
    
    return sortDirection === "asc" ? comparison : -comparison;
  });

  // =====================================================
  // Toggle sort direction or change sort field
  // =====================================================
  const handleSort = (field: "name" | "type" | "size") => {
    if (sortBy === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDirection("asc");
    }
  };

  // =====================================================
  // Get icon based on file type and extension
  // =====================================================
  const getFileIcon = (fileName: string, type: string) => {
    if (type === "dir") return "📁";
    
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch(ext) {
      case 'py': return "🐍";
      case 'js': return "📜";
      case 'ts': return "📘";
      case 'html': return "🌐";
      case 'css': return "🎨";
      case 'json': return "📋";
      case 'md': return "📝";
      case 'txt': return "📄";
      case 'jpg': case 'jpeg': case 'png': case 'gif': return "🖼️";
      default: return "📄";
    }
  };

  return (
    <div className="bg-zinc-800 rounded-lg p-4 mb-4 border border-zinc-700">
      
      {/* ================================================= */}
      {/* Header with current directory and controls */}
      {/* ================================================= */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <span className="text-yellow-500 text-xl">📁</span>
          <span className="text-sm font-mono text-blue-400 truncate max-w-md" title={currentDir}>
            {currentDir}
          </span>
        </div>
        
        {/* Refresh button */}
        <button
          onClick={() => onNavigate(".")}
          className="text-xs bg-zinc-700 px-2 py-1 rounded hover:bg-zinc-600"
          title="Refresh"
        >
          🔄
        </button>
      </div>

      {/* ================================================= */}
      {/* Sort controls */}
      {/* ================================================= */}
      <div className="flex gap-2 mb-2 text-xs text-zinc-400">
        <button
          onClick={() => handleSort("name")}
          className={`hover:text-white ${sortBy === "name" ? "text-blue-400" : ""}`}
        >
          Name {sortBy === "name" && (sortDirection === "asc" ? "↑" : "↓")}
        </button>
        <button
          onClick={() => handleSort("type")}
          className={`hover:text-white ${sortBy === "type" ? "text-blue-400" : ""}`}
        >
          Type {sortBy === "type" && (sortDirection === "asc" ? "↑" : "↓")}
        </button>
        <button
          onClick={() => handleSort("size")}
          className={`hover:text-white ${sortBy === "size" ? "text-blue-400" : ""}`}
        >
          Size {sortBy === "size" && (sortDirection === "asc" ? "↑" : "↓")}
        </button>
      </div>

      {/* ================================================= */}
      {/* File list with scrollable area */}
      {/* ================================================= */}
      <div className="space-y-1 max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-600">
        
        {/* Parent directory navigation (unless at root) */}
        {currentDir !== "/" && !currentDir.match(/^[A-Z]:\\$/i) && (
          <button
            onClick={() => onNavigate("..")}
            className="w-full text-left px-3 py-2 hover:bg-zinc-700 rounded flex items-center gap-3 text-zinc-300 transition-colors"
          >
            <span className="text-yellow-500 text-lg">📁</span>
            <span className="font-mono">..</span>
            <span className="text-xs text-zinc-500 ml-auto">parent directory</span>
          </button>
        )}

        {/* Files and folders */}
        {sortedFiles.map((file) => (
          <button
            key={file.name}
            onClick={() => file.type === "dir" ? onNavigate(file.name) : onFileClick?.(file)}
            className="w-full text-left px-3 py-2 hover:bg-zinc-700 rounded flex items-center gap-3 text-zinc-300 transition-colors group"
            title={file.type === "dir" ? "Click to open folder" : "Click to view file"}
          >
            {/* Icon based on type */}
            <span className="text-lg">
              {file.type === "dir" ? "📁" : getFileIcon(file.name, file.type)}
            </span>
            
            {/* Filename with truncation */}
            <span className="font-mono truncate flex-1">{file.name}</span>
            
            {/* File size (for files only) */}
            {file.type === "file" && (
              <span className="text-xs text-zinc-500 group-hover:text-zinc-400">
                {formatSize(file.size)}
              </span>
            )}
            
            {/* Small indicator for click action */}
            <span className="text-xs text-zinc-600 group-hover:text-zinc-400">
              {file.type === "dir" ? "→" : "👁️"}
            </span>
          </button>
        ))}

        {/* Empty folder message */}
        {sortedFiles.length === 0 && (
          <div className="text-zinc-500 text-center py-8">
            📂 Empty folder
          </div>
        )}
      </div>

      {/* ================================================= */}
      {/* Status bar with file/folder count */}
      {/* ================================================= */}
      <div className="mt-3 pt-2 border-t border-zinc-700 text-xs text-zinc-500 flex justify-between">
        <span>
          📁 {files.filter(f => f.type === "dir").length} folders
        </span>
        <span>
          📄 {files.filter(f => f.type === "file").length} files
        </span>
        <span>
          Total: {files.length} items
        </span>
      </div>
    </div>
  );
}