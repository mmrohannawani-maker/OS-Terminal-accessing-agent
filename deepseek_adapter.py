"""
DeepSeek-V3 adapter - Takes DeepSeek's output and converts to LangChain-compatible format
"""

import json
import re
from typing import Dict, Any, List
from langchain_core.messages import AIMessage, ToolCall
from langchain_core.tools import BaseTool
from memory_postgres import PostgresMemory


def extract_tool_calls_from_deepseek(response_text: str) -> List[Dict[str, Any]]:
    """
    Extract tool calls from DeepSeek's response text
    FIXED: Handles markdown code blocks and multiline JSON
    """
    tool_calls = []
    
    # Step 1: Remove markdown code blocks (```json and ```)
    import re
    import json
    
    # Remove ```json and ``` markers
    clean_text = re.sub(r'```json\s*', '', response_text)
    clean_text = re.sub(r'```\s*', '', clean_text)
    clean_text = clean_text.strip()
    
    # Step 2: Find complete JSON objects
    brace_count = 0
    start_idx = -1
    
    for i, char in enumerate(clean_text):
        if char == '{':
            if brace_count == 0:
                start_idx = i
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0 and start_idx != -1:
                json_str = clean_text[start_idx:i+1]
                try:
                    data = json.loads(json_str)
                    if 'name' in data and 'arguments' in data:
                        tool_calls.append({
                            'name': data['name'],
                            'args': data['arguments'],
                            'id': f"call_{abs(hash(json_str)) % 1000000}"
                        })
                except:
                    pass
                start_idx = -1
    
    # Step 3: If no tool calls found, try the old methods as fallback
    if not tool_calls:
        # Try to find any JSON-like structure
        json_pattern = r'\{[^{}]*"name"[^{}]*"arguments"[^{}]*\}'
        matches = re.findall(json_pattern, response_text)
        
        for match in matches:
            try:
                tool_data = json.loads(match)
                if 'name' in tool_data and 'arguments' in tool_data:
                    tool_calls.append({
                        'name': tool_data['name'],
                        'args': tool_data['arguments'],
                        'id': f"call_{abs(hash(match)) % 1000000}"
                    })
            except:
                pass
    
    # Debug output (you can remove this later)
    if tool_calls:
        print(f"✅ Extracted {len(tool_calls)} tool calls")
    else:
        print(f"⚠️  No tool calls extracted from response")
    
    return tool_calls

memory = PostgresMemory()

def create_manual_agent(llm, tools: List[BaseTool], system_prompt: str):
    """
    Create a manual agent that bypasses LangChain's schema validation
    """
    tool_dict = {tool.name: tool for tool in tools}
    
    def agent_fn(input_dict) :
        # print("\n" + "="*60)
        # print("🔍 DEEPSEEK ADAPTER CALLED")
        # print("="*60)
        # print(f"📥 Input type: {type(input_dict)}")
        # print(f"📥 Input keys: {list(input_dict.keys()) if isinstance(input_dict, dict) else 'Not dict'}")
        

        # Get user input
        if 'messages' in input_dict:
            user_message = input_dict['messages'][-1].content
        else:
            user_message = input_dict.get('input', '')

        # Store user intent in the sandbox tools
        if hasattr(tool_dict.get('execute_command'), '__self__'):
            sandbox = tool_dict['execute_command'].__self__
            sandbox.current_user_intent = user_message

        #print(f"🎯 USER INTENT: {sandbox.current_user_intent[:50]}...")


         # Store user message
        memory.add_user_message(user_message)
        
        # Get chat history
        chat_history = memory.get_history(limit=50)

        # After getting chat_history, add current path context
        path_context = ""
        if hasattr(agent_fn, '_path_context') and agent_fn._path_context:
            path_context = "\n".join(agent_fn._path_context[-3:])  # Last 3 path changes
        elif hasattr(agent_fn, 'history'):
            # Look for path messages in history
            for msg in reversed(agent_fn.history[-10:]):
                if "Working directory changed" in msg:
                    path_context = msg
                    break




        #  # 🔴 CRITICAL DEBUG - REMOVE AFTER TESTING
        # print("\n" + "="*60)
        # print("📜 HISTORY BEING SENT TO LLM:")
        # print("="*60)
        # print(chat_history)
        # print("="*60 + "\n")
        
        # Build prompt with tool descriptions
        tool_descriptions = "\n".join([
            f"- {tool.name}: {tool.description} Args: {tool.args}"
            for tool in tools
        ])
        
        prompt = f"""{system_prompt}

        [SYSTEM CONTEXT]
        {path_context}

        
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📜 CONVERSATION HISTORY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{chat_history}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AVAILABLE TOOLS:
{tool_descriptions}

USER REQUEST: {user_message}




INSTRUCTIONS:
- If the user is asking a QUESTION or CHATTING, respond with normal text
- ONLY use a tool JSON when the user wants to DO something (create, delete, read files)
- For questions about previous conversations, just answer directly - NO TOOL NEEDED

Response format:
- For normal chat: Just your answer in plain text
- For tool use: Format: {{"name": "tool_name", "arguments": {{"arg1": "value1"}}}}
"""


        # 🔴 CRITICAL DEBUG - REMOVE AFTER TESTING
        # print("\n" + "="*60)
        # print("📤 FULL PROMPT BEING SENT (first 500 chars):")
        # print("="*60)
        # print(prompt[:500] + "..." if len(prompt) > 500 else prompt)
        # print("="*60 + "\n")

        # Get LLM response
        response = llm.invoke(prompt)

        # print("\n" + "-"*40)
        # print("🤖 RAW LLM RESPONSE:")
        # print("-"*40)
        # if hasattr(response, 'content'):
        #     print(response.content[:500] + "..." if len(response.content) > 500 else response.content)
        # else:
        #     print(str(response)[:500])
        #     print("-"*40)
        
        # Extract content
        if hasattr(response, 'content'):
            content = response.content
        else:
            content = str(response)
        
        # Extract tool calls
        tool_calls = extract_tool_calls_from_deepseek(content)

        # 🔴 ADD THIS DEBUG LINE
        print(f"🔍 TOOL EXTRACTED: {tool_calls[0]['name'] if tool_calls else 'NO TOOL'}")

        # If you want arguments too:
        if tool_calls:
            print(f"📋 TOOL ARGS: {tool_calls[0]['args']}")
        
        messages = []
        
        # Add assistant message with tool calls
        ai_message = AIMessage(
            content="",
            tool_calls=[
                ToolCall(
                    name=tc['name'],
                    args=tc['args'],
                    id=tc['id']
                ) for tc in tool_calls
            ]
        )
        messages.append(ai_message)
        
        # Execute tools
       

        for tool_call in tool_calls:
            tool = tool_dict.get(tool_call['name'])
    
            # DEBUG: Check if tool exists
            # print(f"🔍 DEBUG: Processing tool call: {tool_call['name']}")
            # print(f"   Args: {tool_call['args']}")
            # print(f"   Tool ID: {tool_call.get('id', 'No ID')}")
    
            if tool:
                # print(f"✅ DEBUG: Tool '{tool_call['name']}' found in tool_dict")
                # print(f"   Tool object: {tool}")
        
                try:
                    # print(f"⚡ DEBUG: Invoking tool with args: {tool_call['args']}")
                    result = tool.invoke(tool_call['args'])
                    # print(f"✅ DEBUG: Tool invoke successful")
                    # print(f"   Result: {result[:200] if isinstance(result, str) else str(result)[:200]}")
            
                    from langchain_core.messages import ToolMessage
                    tool_message = ToolMessage(
                        content=str(result),
                        tool_call_id=tool_call['id'],
                        name=tool_call['name']
                    )
                    messages.append(tool_message)
                    # print(f"📦 DEBUG: ToolMessage created and appended")
            
                except Exception as e:
                    print(f"❌ DEBUG: Tool invoke FAILED")
                    print(f"   Error type: {type(e).__name__}")
                    print(f"   Error message: {str(e)}")
                    import traceback
                    print(f"   Traceback: {traceback.format_exc()[:200]}")
            
                    from langchain_core.messages import ToolMessage
                    error_message = ToolMessage(
                    content=f"Error: {str(e)}",
                    tool_call_id=tool_call['id'],
                    name=tool_call['name']
                    )
                    messages.append(error_message)
                    print(f"📦 DEBUG: Error ToolMessage created and appended")
            else:
                print(f"❌ DEBUG: Tool '{tool_call['name']}' NOT FOUND in tool_dict")
                print(f"   Available tools: {list(tool_dict.keys())}")
        
        # Get final response
        if messages and tool_calls:
            final_prompt = f"""Based on the tool results, answer the user's request.

User: {user_message}

Tool results: {messages[-1].content if messages else "No results"}

Provide a helpful response:"""
            
            final_response = llm.invoke(final_prompt)
            final_content = final_response.content if hasattr(final_response, 'content') else str(final_response)
            
            messages.append(AIMessage(content=final_content))

            # Store assistant response
            memory.add_assistant_message(final_content)
        else:
            # No tool calls, use direct response
            messages.append(AIMessage(content=content))
            memory.add_assistant_message(content)
        
        return {"messages": messages}
    
    return agent_fn

def patch_deepseek_agent(original_agent):
    """
    Wrap the original agent to handle schema errors
    """
    def wrapped_invoke(input_dict):
        try:
            # Try original agent first
            return original_agent.invoke(input_dict)
        except Exception as e:
            if "Unsupported schema type" in str(e):
                print("⚠️  LangChain schema error detected. Using manual adapter...")
                
                # Extract components from original agent
                from terminal_tools import create_tools
                import os
                
                tools = create_tools(os.getcwd())
                llm = original_agent.__dict__.get('model', None)
                
                if llm:
                    manual_agent = create_manual_agent(
                        llm=llm,
                        tools=tools,
                        system_prompt="You are a file management assistant."
                    )
                    return manual_agent(input_dict)
            
            raise e
    
    return wrapped_invoke