# terminal_agent/middleware/safety_middleware.py
from typing import Any, Dict
from langchain.agents.middleware import wrap_tool_call
from langchain.agents.middleware import SummarizationMiddleware
import os
import re

def create_safety_middleware(sandbox_root: str):
    """Create middleware that validates tool calls stay within sandbox"""
    
    @wrap_tool_call
    def safety_middleware(tool_call: Dict[str, Any]) -> Dict[str, Any]:
        """Middleware to validate paths in tool calls"""
        
        # Get the tool name and arguments
        tool_name = tool_call.get("name", "")
        args = tool_call.get("args", {})
        
        # DEBUG: Log every tool call
        print(f"🔍 SAFETY CHECK: Tool={tool_name}, Args={args}")
        
        # Skip if no args
        if not args:
            return tool_call
        
        # Define which arguments contain paths for each tool
        path_args = {
            "read_file": ["file_path"],
            "write_file": ["file_path"],
            "delete_path": ["path"],
            "list_directory": ["directory_path"],
            "execute_command": ["working_directory"]
        }
        
        if tool_name in path_args:
            for arg_name in path_args[tool_name]:
                if arg_name in args and args[arg_name]:
                    path = args[arg_name]
                    
                    try:
                        # DEBUG: Path validation
                        print(f"   📁 Validating path: {path}")
                        
                        # Check if it's trying to escape sandbox
                        if os.path.isabs(path):
                            # Absolute path - must start with sandbox_root
                            if not path.startswith(sandbox_root):
                                print(f"   ❌ BLOCKED: Absolute path outside sandbox: {path}")
                                return {
                                    "name": tool_name,
                                    "args": args,
                                    "output": f"❌ Blocked: Absolute path '{path}' is outside sandbox"
                                }
                        else:
                            # Relative path - check if any parent traversal
                            if path.startswith("../") or "/../" in path:
                                # Resolve it and check
                                resolved = os.path.abspath(os.path.join(sandbox_root, path))
                                if not resolved.startswith(sandbox_root):
                                    print(f"   ❌ BLOCKED: Path traversal attempt: {path}")
                                    return {
                                        "name": tool_name,
                                        "args": args,
                                        "output": f"❌ Blocked: Path '{path}' would escape sandbox"
                                    }
                        print(f"   ✅ Path validation passed: {path}")
                    except Exception as e:
                        print(f"   ❌ Path validation error: {e}")
                        return {
                            "name": tool_name,
                            "args": args,
                            "output": f"❌ Error validating path: {str(e)}"
                        }
        
        # For execute_command, also check the command itself
        if tool_name == "execute_command" and "command" in args:
            command = args["command"]
            print(f"   💻 Validating command: {command}")
            
            # Block obvious escape attempts
            dangerous_patterns = [
                r'rm\s+-rf\s+[/~]',  # rm -rf /
                r':\(\)\{:',          # Fork bomb
                r'dd\s+if=',          # dd commands
                r'mkfs',              # Format commands
                r'chmod\s+777\s+[/~]', # chmod 777 /
                r'>\s*/dev/',         # Write to devices
                r'mv\s+.*\s+/dev/null', # mv to null
            ]
            
            for pattern in dangerous_patterns:
                if re.search(pattern, command, re.IGNORECASE):
                    print(f"   ❌ BLOCKED: Dangerous command pattern: {pattern}")
                    return {
                        "name": tool_name,
                        "args": args,
                        "output": f"❌ Blocked: Command contains dangerous pattern: {command}"
                    }
            
            print(f"   ✅ Command validation passed")
        
        return tool_call
    
    return safety_middleware

# def create_summarization_middleware(llm):
#     """Create summarization middleware for memory management"""
    
#     try:
#         print("🧠 Initializing SummarizationMiddleware...")
#         middleware = SummarizationMiddleware(
#             model=llm,
#             trigger=("tokens", 4000),
#             keep=("messages", 20),
#         )
#         print("✅ SummarizationMiddleware created successfully")
#         return middleware
#     except Exception as e:
#         print(f"❌ Failed to create SummarizationMiddleware: {e}")
#         print(f"   Error type: {type(e).__name__}")
#         print(f"   Error details: {str(e)}")
#         return None