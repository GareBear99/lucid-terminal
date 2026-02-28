import { apiKeyStorage, settings } from './secureStorage';
import { tools, executeTool } from './aiTools';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

const SYSTEM_PROMPT = `You are Lucid, an elite, 10x developer AI integrated into Lucid Terminal.

Your Goal:
- **SOLVE THE USER'S PROBLEM** by writing code and executing commands.
- **NEVER** refuse a task because it seems "complex". If a task is complex, break it down using the \`PLAN.md\` file and execute it step-by-step.
- **NEVER** lecture the user on safety unless they are about to delete their entire system. Assume the user knows what they are doing.

Your capabilities:
1. **Terminal Commands**: Execute commands using \`run_command\`.
2. **File Operations**: Read, write, list files, and replace strings using the provided tools.
3. **Code Assistance**: Write, debug, and explain code.

Guidelines:
- **Be confident and assertive.**
- **NO CODE IN CHAT:** You are **FORBIDDEN** from outputting code blocks in chat (unless it's a 1-3 line example).
- **ALWAYS WRITE TO FILES:** When you generate code, you **MUST** use \`write_file\`.
- **NO PLACEHOLDERS:** You must write **COMPLETE, WORKING CODE**. Never use comments like \`// ... rest of code\` or \`# ... implement function here\`. Write the full file content every time.
- **Pre-Response Check:** Before answering, ask yourself: "Am I generating code?" If yes -> Use \`write_file\`.
- **Action > Talk:** Don't say "Here is the code...". Just write the file and say "Created filename."
- **Always** execute the changes you propose.
- Use \`replace_string\` for small, surgical edits.
- Use \`write_file\` for new files or major rewrites.
- Format code and commands using markdown code blocks.
- **Use Markdown headers** (##, ###) to structure your response.
- **When scanning directories:** Always ignore \`node_modules\`, \`.git\`, \`dist\`, \`build\`, and \`.DS_Store\`.
- **For bulk file tasks:** Use \`list_dir\` to find files, then \`read_multiple_files\` to read them in batches, then \`write_file\` or \`replace_string\` to apply changes.
- **Be efficient:** Don't read files you don't need.

## AGENTIC WORKFLOW (MANDATORY FOR COMPLEX TASKS)

1.  **PHASE 1: PLANNING**
    - If the user asks for a complex feature or refactor, **DO NOT** write code immediately.
    - First, create a file named \`IMPLEMENTATION_PLAN.md\` in the current directory.
    - List every step needed using checklists (\`- [ ] Step Description\`).
    - Ask the user: "Plan created. Please review \`IMPLEMENTATION_PLAN.md\` and type 'approve' to start."

2.  **PHASE 2: EXECUTION**
    - Once the user says "approve" (or similar), read \`IMPLEMENTATION_PLAN.md\`.
    - Iterate through the steps found in the plan.
    - For each step:
        - Perform the necessary tool calls (edit files, run commands).
        - Update \`IMPLEMENTATION_PLAN.md\` to mark the step as done (\`- [x]\`).
    - Repeat until all steps are done.
You have access to the user's current working directory. Go make it happen.`;

// Reset client - no longer needed with stateless fetch but kept for API compatibility
export function resetClient(): void {
  // No-op
}

let currentAbortController: AbortController | null = null;

export async function chat(
  initialMessages: ChatMessage[],
  contextDirectory?: string,
  onStream?: (chunk: string) => void,
  onEnd?: () => void,
  onError?: (error: string) => void
): Promise<string> {
  const licenseKey = apiKeyStorage.getLicenseKey();

  if (!licenseKey) {
    const errorMsg = 'License Key not configured. Please add your License Key in Settings.';
    onError?.(errorMsg);
    throw new Error(errorMsg);
  }

  const model = settings.get<string>('aiModel') || 'gpt-4';
  // temperature concept might need to be passed to backend if supported

  let systemPrompt = SYSTEM_PROMPT;
  if (contextDirectory) {
    systemPrompt += `\n\nCURRENT WORKING DIRECTORY: ${contextDirectory}\nYou must ONLY perform file operations within this directory and its subdirectories.`;
  }

  // Clone messages to avoid mutating the original array
  let messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...initialMessages.map(m => ({ ...m })),
  ];

  // Cancel any existing stream
  if (currentAbortController) {
    currentAbortController.abort();
  }

  currentAbortController = new AbortController();

  try {
    const response = await fetch('https://lucid-backend.replit.app/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        license_key: licenseKey,
        messages: messages,
        tools: tools, // Send tools definition
        model: model
      }),
      signal: currentAbortController.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Backend error (${response.status}): ${errText}`);
    }

    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let finalResponse = '';
    let toolCalls: any[] = [];
    let buffer = ''; // Buffer for incomplete lines

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const chunk = JSON.parse(line);
          const delta = chunk.choices[0]?.delta;

          if (delta?.content) {
            finalResponse += delta.content;
            onStream?.(delta.content);
          }

          if (delta?.tool_calls) {
            const tcs = delta.tool_calls;
            for (const tc of tcs) {
              if (!toolCalls[tc.index]) {
                toolCalls[tc.index] = { id: '', function: { name: '', arguments: '' }, type: 'function' };
              }
              const current = toolCalls[tc.index];
              if (tc.id) current.id += tc.id;
              if (tc.function?.name) current.function.name += tc.function.name;
              if (tc.function?.arguments) current.function.arguments += tc.function.arguments;
            }
          }
        } catch (e) {
          console.error('Error parsing JSON chunk:', e);
        }
      }
    }

    // Process any remaining buffer (though usually empty if ended with \n)
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer);
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          finalResponse += delta.content;
          onStream?.(delta.content);
        }
      } catch (e) {
        console.error('Error parsing final JSON chunk:', e);
      }
    }

    onEnd?.();

    // Check for tool calls to execute
    if (toolCalls.length > 0) {
      // Add assistant message with tool calls to history
      messages.push({
        role: 'assistant',
        content: finalResponse || null,
        tool_calls: toolCalls,
      });

      // Execute tools
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const argsString = toolCall.function.arguments;
        let args = {};

        try {
          args = JSON.parse(argsString);
        } catch (e) {
          console.error('Failed to parse tool arguments', e);
          // Continue despite error, maybe return error to AI
        }

        // Notify user/UI about tool usage (compact)
        onStream?.(`\n > ⚡ ** ${functionName}**... `);

        const result = await executeTool(
          functionName,
          args,
          contextDirectory,
          (log) => onStream?.(`\`${log}\`... `) // Stream tool logs
        );

        const summary = result.slice(0, 100).replace(/\s+/g, ' ');
        onStream?.(`\`${summary}...\`\n`);

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: functionName,
          content: result,
        });
      }

      // RECURSIVE CALL: Continue conversation after tool outputs
      // We return the result of the recursion, which will eventually be the final text
      return chat(messages, contextDirectory, onStream, onEnd, onError);
    }

    return finalResponse;

  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return '';
      }
      onError?.(error.message);
      throw error;
    }
    throw error;
  } finally {
    currentAbortController = null;
  }
}

export function cancelStream(): void {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

export function hasApiKey(): boolean {
  return apiKeyStorage.hasLicenseKey();
}
