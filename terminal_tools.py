# terminal_agent/tools/terminal_tools.py
import os
import subprocess
import shutil
from pathlib import Path
from typing import Optional, Type
from langchain.tools import tool
from pydantic import BaseModel, Field

# Global variable to store user-specified path from UI
#_USER_SPECIFIED_PATH = None

# ===== ADD THESE LINES HERE =====
# Global variable to store user-specified path from UI
_USER_SPECIFIED_PATH = None

def set_user_path(path: str):
    """Set the user-specified path from UI (called from api.py)"""
    global _USER_SPECIFIED_PATH
    _USER_SPECIFIED_PATH = os.path.abspath(path)
    print(f"[DEBUG] User path set to: {_USER_SPECIFIED_PATH}")
    return _USER_SPECIFIED_PATH

def get_user_path():
    """Get the current user-specified path"""
    return _USER_SPECIFIED_PATH
# ===== END OF ADDED LINES =====

def set_user_path(path: str):
    """Set the user-specified path from UI (called from api.py)"""
    global _USER_SPECIFIED_PATH
    _USER_SPECIFIED_PATH = os.path.abspath(path)
    print(f"[DEBUG] User path set to: {_USER_SPECIFIED_PATH}")

def get_user_path():
    """Get the current user-specified path"""
    return _USER_SPECIFIED_PATH

class SandboxTools:
    """Container for tools that all share the same sandbox root"""
    
    def __init__(self, sandbox_root: str, llm=None):
        self.sandbox_root = os.path.abspath(sandbox_root)
        self.llm = llm  # Store LLM reference
        self.current_user_intent = ''
        self.timeout = 300  # Default timeout
        print(f"[DEBUG INIT] Sandbox root set to: {self.sandbox_root}")

    def update_sandbox_root(self, new_root: str):
        """Update the sandbox root dynamically"""
        old_root = self.sandbox_root
        self.sandbox_root = os.path.abspath(new_root)
        print(f"[DEBUG] Sandbox root updated: {old_root} → {self.sandbox_root}")
        return self.sandbox_root
        
    def _validate_path(self, input_path: str) -> str:
        """Ensure path stays within sandbox - NOW USES USER PATH"""
        # Use user-specified path if available
        base_path = get_user_path() or self.sandbox_root
        
        print(f"[DEBUG _validate_path] Input path: {input_path}")
        print(f"[DEBUG _validate_path] Using base path: {base_path}")
        
        if input_path is None:
            print(f"[DEBUG _validate_path] Path is None, using base path: {base_path}")
            return base_path
            
        # Handle relative paths
        if not os.path.isabs(input_path):
            abs_path = os.path.join(base_path, input_path)
            print(f"[DEBUG _validate_path] Joined with base path: {abs_path}")
        else:
            abs_path = input_path
            
        # Clean the path
        abs_path = os.path.normpath(abs_path)
        print(f"[DEBUG _validate_path] Normalized path: {abs_path}")
        
        # Resolve any .. or symlinks
        try:
            resolved_path = os.path.abspath(os.path.realpath(abs_path))
            print(f"[DEBUG _validate_path] Resolved real path: {resolved_path}")
        except Exception as e:
            print(f"[DEBUG _validate_path] Error resolving path: {e}")
            resolved_path = os.path.abspath(abs_path)
        
        # Check if path is within sandbox (using base_path for security)
        if not resolved_path.startswith(base_path):
            print(f"[DEBUG _validate_path] PermissionError: {resolved_path} outside sandbox {base_path}")
            raise PermissionError(
                f"Path '{input_path}' resolved to '{resolved_path}' which is outside sandbox: {base_path}"
            )
        
        return resolved_path
    
    def _run_command(self, command: str, cwd: Optional[str] = None) -> str:
        """Run a shell command safely with interactive prompt handling"""
        try:
            # Use user-specified path as base
            base_path = get_user_path() or self.sandbox_root
            
            if cwd is None:
                cwd = base_path
            else:
                # If cwd is provided, validate it relative to base_path
                if not os.path.isabs(cwd):
                    cwd = os.path.join(base_path, cwd)
                cwd = os.path.normpath(cwd)
        
            print(f"[DEBUG _run_command] Running command: {command}")
            print(f"[DEBUG _run_command] In directory: {cwd}")
            print(f"[DEBUG _run_command] Current base path: {base_path}")
            
            # Basic command safety check
            dangerous_patterns = [
                'rm -rf /', 'rm -rf /*', ':(){:|:&};:',  # Fork bomb
                'dd if=/dev/', 'mkfs', 'chmod 777 /',
                '> /dev/sda', 'mv / /dev/null'
            ]
        
            for pattern in dangerous_patterns:
                if pattern in command.lower():
                    return f"Error: Command blocked for safety: {pattern}"
        
            # Check if command is likely interactive
            interactive_commands = ['npm init', 'npm create', 'npx create', 'git init', 'ssh', 'ftp']
            is_interactive = any(cmd in command.lower() for cmd in interactive_commands)
        
            if is_interactive:
                import threading
                import queue
                import time
            
                process = subprocess.Popen(
                    command,
                    shell=True,
                    cwd=cwd,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1
                )
            
                full_output = []
                output_queue = queue.Queue()
            
                def read_output():
                    while True:
                        line = process.stdout.readline()
                        if not line:
                            break
                        line = line.rstrip()
                        output_queue.put(line)
                        full_output.append(line)
                    
                        # Check for prompts
                        if '?' in line or ':' in line or '[' in line:
                            time.sleep(0.1)
                            answer = self._get_fallback_answer(line)
                            if answer is not None:
                                process.stdin.write(answer + "\n")
                                process.stdin.flush()
                                full_output.append(f"> {answer}")
            
                reader = threading.Thread(target=read_output, daemon=True)
                reader.start()
            
                try:
                    process.wait(timeout=360)
                except subprocess.TimeoutExpired:
                    process.kill()
                    return "Error: Command timed out"
            
                reader.join(timeout=2)
                return "\n".join(full_output) if full_output else "Command completed"
        
            else:
                result = subprocess.run(
                    command,
                    shell=True,
                    cwd=cwd,
                    capture_output=True,
                    text=True,
                    timeout=360,
                    env={**os.environ, 'PATH': os.environ.get('PATH', '')}
                )
                print(f"[DEBUG _run_command] Non-interactive command finished with returncode: {result.returncode}")

                output = ""
                if result.stdout:
                    output += result.stdout
                if result.stderr:
                    if output:
                        output += "\n\nErrors:\n"
                    output += result.stderr
            
                if result.returncode != 0 and not output:
                    output = f"Command failed with exit code {result.returncode}"
            
                return output if output else "Command executed (no output)"
            
        except subprocess.TimeoutExpired:
            return "Error: Command timed out after 360 seconds"
        except Exception as e:
            return f"Error executing command: {str(e)}"

    def _get_fallback_answer(self, prompt_text: str) -> str:
        """Simple fallback answers for common prompts"""
        prompt_lower = prompt_text.lower()
    
        if 'project name' in prompt_lower or 'package name' in prompt_lower:
            return 'my-app'
        if '[y/n]' in prompt_lower or '(y/n)' in prompt_lower:
            return 'y'
        if 'template' in prompt_lower or 'framework' in prompt_lower:
            return 'react'
        if 'default' in prompt_lower or 'enter' in prompt_lower:
            return ''
        if 'password' in prompt_lower:
            return 'test123'
        return None

# Define input schemas for each tool
class ReadFileInput(BaseModel):
    file_path: str = Field(description="Path to the file to read, relative to sandbox root")

class WriteFileInput(BaseModel):
    file_path: str = Field(description="Path to the file to write")
    content: str = Field(description="Content to write to the file")
    append: bool = Field(default=False, description="Whether to append to existing file")

class DeletePathInput(BaseModel):
    path: str = Field(description="Path to file or directory to delete")

class ListDirectoryInput(BaseModel):
    directory_path: str = Field(default=".", description="Directory path to list contents of")

class ExecuteCommandInput(BaseModel):
    command: str = Field(description="Terminal command to execute")
    working_directory: str = Field(default=".", description="Working directory for command")

# Factory function to create tools with sandbox
def create_tools(sandbox_root: str, llm=None):
    """Create all tools with shared sandbox root and LLM for interactivity"""
    sandbox = SandboxTools(sandbox_root, llm=llm)
    
    @tool(args_schema=ReadFileInput, description="Read contents of a file")
    def read_file(file_path: str) -> str:
        try:
            safe_path = sandbox._validate_path(file_path)
            if not os.path.exists(safe_path):
                return f"Error: File not found: {file_path}"
            if os.path.isdir(safe_path):
                return f"Error: {file_path} is a directory, not a file"
            file_size = os.path.getsize(safe_path)
            if file_size > 1024 * 1024:
                return f"Error: File too large ({file_size} bytes > 1MB)"
            with open(safe_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                return f"Content of {file_path}:\n\n{content}"
        except Exception as e:
            return f"Error reading file: {str(e)}"
    
    @tool(args_schema=WriteFileInput, description="Create or update a file")
    def write_file(file_path: str, content: str, append: bool = False) -> str:
        try:
            safe_path = sandbox._validate_path(file_path)
            os.makedirs(os.path.dirname(safe_path), exist_ok=True)
            mode = 'a' if append else 'w'
            with open(safe_path, mode, encoding='utf-8') as f:
                f.write(content)
            action = "appended to" if append else "wrote to"
            return f"✓ Successfully {action} {file_path} ({len(content)} bytes)"
        except Exception as e:
            return f"Error writing file: {str(e)}"
    
    @tool(args_schema=DeletePathInput, description="Delete a file or directory")
    def delete_path(path: str) -> str:
        try:
            safe_path = sandbox._validate_path(path)
            if not os.path.exists(safe_path):
                return f"Error: Path does not exist: {path}"
            if os.path.isdir(safe_path):
                if os.listdir(safe_path):
                    return f"Error: Directory not empty. Use 'rm -rf {path}' via execute_command"
                os.rmdir(safe_path)
                return f"✓ Deleted directory: {path}"
            else:
                os.remove(safe_path)
                return f"✓ Deleted file: {path}"
        except Exception as e:
            return f"Error deleting: {str(e)}"
    
    @tool(args_schema=ListDirectoryInput, description="List contents of a directory")
    def list_directory(directory_path: str = ".") -> str:
        try:
            safe_path = sandbox._validate_path(directory_path)
            if not os.path.exists(safe_path):
                return f"Error: Directory not found: {directory_path}"
            if not os.path.isdir(safe_path):
                return f"Error: Not a directory: {directory_path}"
            items = os.listdir(safe_path)
            result = [f"📁 Contents of {directory_path}/ ({len(items)} items):", ""]
            dirs = [item for item in sorted(items) if os.path.isdir(os.path.join(safe_path, item))]
            files = [item for item in sorted(items) if not os.path.isdir(os.path.join(safe_path, item))]
            if dirs:
                result.append("📂 Directories:")
                for d in dirs:
                    result.append(f"  📁 {d}/")
                result.append("")
            if files:
                result.append("📄 Files:")
                for f in files:
                    file_path = os.path.join(safe_path, f)
                    try:
                        size = os.path.getsize(file_path)
                        if size < 1024:
                            size_str = f"{size} B"
                        elif size < 1024*1024:
                            size_str = f"{size/1024:.1f} KB"
                        else:
                            size_str = f"{size/(1024*1024):.1f} MB"
                        result.append(f"  📄 {f} ({size_str})")
                    except:
                        result.append(f"  📄 {f}")
            if not dirs and not files:
                result.append("(empty directory)")
            return "\n".join(result)
        except Exception as e:
            return f"Error listing directory: {str(e)}"
    
    @tool(args_schema=ExecuteCommandInput, description="Execute a terminal command")
    def execute_command(command: str, working_directory: str = ".") -> str:
        try:
            # Get user-specified path
            user_path = get_user_path()
            
            # Determine working directory
            if working_directory and working_directory != ".":
                if not os.path.isabs(working_directory):
                    base = user_path or sandbox.sandbox_root
                    actual_cwd = os.path.join(base, working_directory)
                else:
                    actual_cwd = working_directory
            else:
                actual_cwd = user_path or sandbox.sandbox_root
            
            actual_cwd = os.path.normpath(actual_cwd)
            print(f"[DEBUG] execute_command running '{command}' in: {actual_cwd}")
            return sandbox._run_command(command, cwd=actual_cwd)
        except Exception as e:
            print(f"❌ COMMAND FAILED: {e}")
            return f"Error executing command: {str(e)}"

    # Add Tavily search tool
    try:
        from langchain_tavily import TavilySearch
        tavily_key = os.getenv("TAVILY_API_KEY")
        if tavily_key:
            @tool(description="Search the internet for real-time information")
            def web_search(query: str) -> str:
                try:
                    search_tool = TavilySearch(max_results=3, topic="general", include_answer=True)
                    result = search_tool.invoke({"query": query})
                    output = []
                    if isinstance(result, dict):
                        if result.get('answer'):
                            output.append(f"📝 SUMMARY: {result['answer']}")
                            output.append("")
                        if result.get('results'):
                            output.append("🔗 SOURCES:")
                            for i, r in enumerate(result['results'][:3], 1):
                                output.append(f"\n  [{i}] {r.get('title', 'No title')}")
                                output.append(f"      {r.get('content', '')[:200]}...")
                                output.append(f"      🔗 {r.get('url', 'No URL')}")
                        if result.get('response_time'):
                            output.append(f"\n⏱️  Search completed in {result['response_time']} seconds")
                        return "\n".join(output)
                    return str(result)
                except Exception as e:
                    return f"❌ Web search failed: {e}"
            print("✅ Tavily web search tool added")
    except ImportError:
        print("⚠️  langchain-tavily not installed")

    return [read_file, write_file, delete_path, list_directory, execute_command, web_search]