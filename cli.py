# cli.py - Complete working version
import os
import sys
import argparse
from typing import Optional

# Try to load dotenv, but don't crash if not installed
try:
    from dotenv import load_dotenv
    load_dotenv()
    DOTENV_LOADED = True
except ImportError:
    print("⚠️  python-dotenv not installed. Install with: pip install python-dotenv")
    print("⚠️  Using environment variables directly...")
    DOTENV_LOADED = False
except Exception as e:
    print(f"⚠️  Error loading .env: {e}")
    DOTENV_LOADED = False

# FIXED IMPORT - NO DOT!
try:
    from agent_builder import build_terminal_agent
    AGENT_BUILDER_LOADED = True
except ImportError as e:
    print(f"❌ Cannot import agent_builder: {e}")
    print(f"📁 Current directory: {os.getcwd()}")
    print(f"📄 Files here: {[f for f in os.listdir('.') if f.endswith('.py')]}")
    AGENT_BUILDER_LOADED = False

def run_agent(sandbox_root: Optional[str] = None):
    """Run the terminal agent in the current or specified directory"""
    
    # Determine sandbox root
    if sandbox_root is None:
        sandbox_root = os.getcwd()
    else:
        sandbox_root = os.path.abspath(sandbox_root)
    
    print(f"🚀 Starting Terminal Agent")
    print(f"📂 Working directory: {sandbox_root}")
    print(f"🔐 Sandbox boundary: {sandbox_root}")
    print("=" * 60)
    
    # Build agent
    try:
        agent, _ = build_terminal_agent(sandbox_root=sandbox_root)
    except Exception as e:
        print(f"❌ Failed to initialize agent: {e}")
        return
    
    # Interactive loop
    print("\n💬 Terminal Agent Ready! Type 'exit', 'quit', or Ctrl+C to end.")
    print("=" * 60)
    
    while True:
        try:
            # Get user input
            user_input = input("\n🤔 You: ").strip()
            
            if user_input.lower() in ['exit', 'quit', 'bye', 'q']:
                print("👋 Goodbye!")
                break
            
            if not user_input:
                continue
            
            print("🔄 Processing...")
            
            # FIXED: Invoke the agent
            from langchain_core.messages import HumanMessage
            
            result = agent.invoke({
                "messages": [HumanMessage(content=user_input)]
            })
            
            # FIXED: Extract the response correctly
            output = ""
            
            if isinstance(result, dict):
                if 'messages' in result:
                    messages = result['messages']
                    if messages:
                        last_message = messages[-1]
                        if hasattr(last_message, 'content'):
                            output = last_message.content
                        elif isinstance(last_message, dict):
                            output = last_message.get('content', '')
                        else:
                            output = str(last_message)
                elif 'output' in result:
                    output = result['output']
                elif 'response' in result:
                    output = result['response']
            elif hasattr(result, 'output'):
                output = result.output
            else:
                output = str(result)
            
            # Clean up the output
            if not output or output == '':
                output = "✅ Task completed"
            
            print(f"\n🤖 Agent: {output}")
            
        except KeyboardInterrupt:
            print("\n👋 Interrupted. Goodbye!")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Terminal Agent - AI-powered file operations in current directory",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  terminal-agent                 # Run in current directory
  terminal-agent ~/projects      # Run in specific directory
  terminal-agent --list-tools    # List available tools
  terminal-agent --sandbox-info  # Show sandbox info
        """
    )
    
    parser.add_argument(
        "directory",
        nargs="?",
        default=None,
        help="Directory to use as sandbox (default: current directory)"
    )
    
    parser.add_argument(
        "--list-tools",
        action="store_true",
        help="List available tools and exit"
    )
    
    parser.add_argument(
        "--sandbox-info",
        action="store_true",
        help="Show sandbox information and exit"
    )
    
    parser.add_argument(
        "--version",
        action="version",
        version="terminal-agent v0.1.0"
    )
    
    args = parser.parse_args()
    
    if args.list_tools:
        print("Available Tools:")
        print("1. read_file    - Read contents of a file")
        print("2. write_file   - Create or update a file")
        print("3. delete_path  - Delete a file or directory")
        print("4. list_directory - List directory contents")
        print("5. execute_command - Run shell commands safely")
        print("\nNote: I can only manipulate files, not write complex code logic.")
        return
    
    if args.sandbox_info:
        sandbox = args.directory if args.directory else os.getcwd()
        sandbox_abs = os.path.abspath(sandbox)
        print(f"Sandbox: {sandbox_abs}")
        print(f"All operations restricted to this folder and subfolders")
        print(f"Contains: {len(os.listdir(sandbox_abs)) if os.path.exists(sandbox_abs) else 0} items")
        return
    
    # Run the agent
    run_agent(args.directory)

if __name__ == "__main__":
    main()