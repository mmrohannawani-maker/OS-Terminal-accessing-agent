#!/usr/bin/env python3
"""
Test script to verify PostgreSQL memory persists after restart
Run this script multiple times to test persistence
"""

import os
import time
from memory_postgres import PostgresMemory

print("=" * 80)
print("🧪 TESTING POSTGRESQL MEMORY PERSISTENCE")
print("=" * 80)

# Initialize memory
memory = PostgresMemory()

# Check current message count
current_count = memory.count_messages() if hasattr(memory, 'count_messages') else "Unknown"
print(f"\n📊 Current messages in database: {current_count}")

# Generate unique test ID
test_id = f"test_{int(time.time())}"
print(f"\n🔖 Test ID: {test_id}")

# Add test messages
print("\n📝 Adding test messages to database...")
memory.add_user_message(f"Test user message {test_id}")
time.sleep(0.1)
memory.add_assistant_message(f"Test assistant response {test_id}")
time.sleep(0.1)
memory.add_user_message(f"Second test message {test_id}")
time.sleep(0.1)
memory.add_assistant_message(f"Second response {test_id}")

print("✅ Test messages added")

# Verify messages were added
print("\n🔍 Verifying messages were added...")
history = memory.get_history(limit=10)
print(f"\n📜 Current history (last 10 messages):")
print("-" * 60)
print(history)
print("-" * 60)

# Check if our test messages are in history
test_found = test_id in history
if test_found:
    print(f"\n✅ SUCCESS: Test messages with ID '{test_id}' found in database")
else:
    print(f"\n❌ FAILED: Test messages with ID '{test_id}' NOT found in database")

print("\n" + "=" * 80)
print("📋 INSTRUCTIONS:")
print("=" * 80)
print("""
1. Run this script once:  python test_memory_persistence.py
2. Note the Test ID shown
3. EXIT completely (close terminal)
4. Open new terminal
5. Run script AGAIN: python test_memory_persistence.py
6. Look for your previous Test ID in the history

If you see your OLD test ID in the history → ✅ MEMORY PERSISTS
If you ONLY see the NEW test ID → ❌ MEMORY LOST
""")
print("=" * 80)