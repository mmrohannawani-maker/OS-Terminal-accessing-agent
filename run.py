#!/usr/bin/env python3
import sys
import os

# Add current directory to Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

print(f"📁 Running from: {current_dir}")
print(f"🔍 Looking for cli.py...")

# Run cli.py with UTF-8 encoding
cli_path = os.path.join(current_dir, "cli.py")

if not os.path.exists(cli_path):
    print(f"❌ cli.py not found at: {cli_path}")
    print(f"📄 Available files: {[f for f in os.listdir(current_dir) if f.endswith('.py')]}")
    input("Press Enter to exit...")
else:
    try:
        # Read with UTF-8 encoding
        with open(cli_path, 'r', encoding='utf-8') as f:
            cli_content = f.read()
        
        print(f"✅ Found cli.py ({os.path.getsize(cli_path)} bytes)")
        print("🚀 Starting Terminal Agent...")
        
        # Execute the content
        exec(cli_content)
        
    except UnicodeDecodeError:
        # Try different encodings
        print("⚠️  UTF-8 failed, trying other encodings...")
        for encoding in ['utf-8-sig', 'latin-1', 'cp1252']:
            try:
                with open(cli_path, 'r', encoding=encoding) as f:
                    cli_content = f.read()
                print(f"✅ Success with {encoding} encoding")
                exec(cli_content)
                break
            except:
                continue
        else:
            print("❌ All encodings failed. File might be corrupted.")
            input("Press Enter to exit...")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        input("Press Enter to exit...")