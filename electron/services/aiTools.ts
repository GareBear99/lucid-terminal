import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  BROWSER_TOOL_UNAVAILABLE,
  getBrowserToolTarget,
} from './browserToolBridge';

const execAsync = promisify(exec);

export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

export const tools: ToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'Read the contents of a single file. Use this to understand code or read configuration files.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Relative or absolute path to the file to read.',
                    },
                },
                required: ['path'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'read_multiple_files',
            description: 'Read the contents of multiple files at once. Use this to understand the codebase structure or relationships between files.',
            parameters: {
                type: 'object',
                properties: {
                    paths: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        description: 'Array of relative or absolute paths to the files to read.',
                    },
                },
                required: ['paths'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Create or overwrite a file with new content. Use this to save code or write configurations.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Relative or absolute path to the file to write.',
                    },
                    content: {
                        type: 'string',
                        description: 'The content to write to the file.',
                    },
                },
                required: ['path', 'content'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_dir',
            description: 'List files and directories in a path. Use this to explore the project structure.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Relative or absolute path to the directory to list.',
                    },
                },
                required: ['path'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'run_command',
            description: 'Execute a terminal command. Use this to run scripts, install packages, or check system status.',
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'The command to execute (e.g., "npm install", "ls -la", "python main.py").',
                    },
                },
                required: ['command'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'replace_string',
            description: 'Replace a specific string in a file with a new string. Use this for small edits.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Relative or absolute path to the file.',
                    },
                    old: {
                        type: 'string',
                        description: 'The exact string to be replaced.',
                    },
                    new: {
                        type: 'string',
                        description: 'The new string to replace it with.',
                    },
                },
                required: ['path', 'old', 'new'],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'browser_navigate',
            description: 'Open a URL in the in-panel browser (the active tab). Use this to go to a page the user asked about.',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'The http(s) URL to open.',
                    },
                },
                required: ['url'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'browser_read_page',
            description: 'Read the visible text of the current page in the in-panel browser. Use this to see what a page says, summarise it, or find information on it.',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'browser_click',
            description: 'Click an element on the current page in the in-panel browser, found by CSS selector.',
            parameters: {
                type: 'object',
                properties: {
                    selector: {
                        type: 'string',
                        description: 'CSS selector of the element to click (e.g. "#submit", "a.next").',
                    },
                },
                required: ['selector'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'browser_fill',
            description: 'Type text into a form field on the current page in the in-panel browser, found by CSS selector. Never use this for a password field - passwords come from the saved-login vault, not from chat.',
            parameters: {
                type: 'object',
                properties: {
                    selector: {
                        type: 'string',
                        description: 'CSS selector of the field to fill (e.g. "#search", "input[name=\"q\"]").',
                    },
                    value: {
                        type: 'string',
                        description: 'Text to type into the field.',
                    },
                },
                required: ['selector', 'value'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'browser_screenshot',
            description: 'Save a screenshot of the current page in the in-panel browser. Returns the file path of the saved PNG.',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'browser_get_state',
            description: 'Describe the current page in the in-panel browser: its URL, title, and the forms on it (so you can see what a form wants before filling it).',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'browser_search',
            description: 'Search the web from the in-panel browser. Returns titles, URLs and snippets for the top results.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query.',
                    },
                },
                required: ['query'],
            },
        },
    },
];

/** Browser tools the AI may call. The local chat path (local_ai.ts)
 * allows ONLY these - never the file/command tools, which a small
 * local model must not be able to reach by hallucinating a call. */
export const browserToolNames: readonly string[] = [
  'browser_navigate',
  'browser_read_page',
  'browser_click',
  'browser_fill',
  'browser_screenshot',
  'browser_get_state',
  'browser_search',
];

export async function executeTool(
    name: string,
    args: any,
    contextDirectory?: string,
    onLog?: (message: string) => void
): Promise<string> {
    try {
        const resolvePath = (p: string) => {
            if (path.isAbsolute(p)) return p;
            return contextDirectory ? path.join(contextDirectory, p) : p;
        };

        switch (name) {
            case 'read_file': {
                const filePath = resolvePath(args.path);
                onLog?.(`Reading file: ${path.basename(filePath)}...`);
                const content = await fs.readFile(filePath, 'utf-8');
                return content;
            }

            case 'read_multiple_files': {
                onLog?.(`Reading ${args.paths.length} files...`);
                const results = await Promise.all(args.paths.map(async (p: string) => {
                    try {
                        onLog?.(`Reading ${path.basename(p)}...`);
                        const filePath = resolvePath(p);
                        const content = await fs.readFile(filePath, 'utf-8');
                        return `--- FILE: ${p} ---\n${content}\n`;
                    } catch (err) {
                        onLog?.(`Error reading ${p}: ${err}`);
                        return `--- FILE: ${p} ---\nError reading file: ${err}\n`;
                    }
                }));
                return results.join('\n');
            }

            case 'replace_string': {
                const filePath = resolvePath(args.path);
                onLog?.(`Modifying file: ${path.basename(filePath)}...`);
                const content = await fs.readFile(filePath, 'utf-8');
                if (!content.includes(args.old)) {
                    return `Error: Could not find string "${args.old}" in file ${args.path}`;
                }
                const newContent = content.replace(args.old, args.new);
                await fs.writeFile(filePath, newContent, 'utf-8');
                onLog?.(`File updated: ${path.basename(filePath)}`);
                return `Successfully replaced string in ${args.path}`;
            }

            case 'write_file': {
                const filePath = resolvePath(args.path);
                onLog?.(`Writing to file: ${path.basename(filePath)}...`);
                const dir = path.dirname(filePath);
                await fs.mkdir(dir, { recursive: true });
                await fs.writeFile(filePath, args.content, 'utf-8');
                onLog?.(`File created/updated: ${path.basename(filePath)}`);
                return `Successfully wrote to ${args.path}`;
            }

            case 'list_dir': {
                const dirPath = resolvePath(args.path);
                onLog?.(`Scanning directory: ${path.basename(dirPath)}...`);
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                const result = entries.map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n');
                return result || 'Empty directory';
            }

            case 'run_command': {
                const cwd = contextDirectory || process.cwd();
                onLog?.(`Executing command: ${args.command}`);

                // Using exec instead of execAsync to potentially stream stdout in future, 
                // but for now keeping it simple with onLog
                const { stdout, stderr } = await execAsync(args.command, { cwd, timeout: 30000 });

                if (stdout) onLog?.(`Command Output: ${stdout.slice(0, 100).replace(/\n/g, ' ')}...`);
                if (stderr) onLog?.(`Command Error: ${stderr.slice(0, 100).replace(/\n/g, ' ')}...`);

                return `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;
            }


            // Browser tools (Area 5): everything runs through the
            // local main-process bridge - the AI asks, main acts on
            // the page. No remote server is involved. Argument
            // validation happens here (a bad call is a clean error
            // string, never a throw), and the bridge reports when
            // no browser tab is open.
            case 'browser_navigate': {
                const target = getBrowserToolTarget();
                if (!target) return BROWSER_TOOL_UNAVAILABLE;
                if (typeof args.url !== 'string' || !args.url.trim()) {
                    return 'Error: browser_navigate needs a url string.';
                }
                onLog?.(`Opening in browser: ${args.url}`);
                return await target.navigate(args.url);
            }

            case 'browser_read_page': {
                const target = getBrowserToolTarget();
                if (!target) return BROWSER_TOOL_UNAVAILABLE;
                onLog?.('Reading the current page...');
                return await target.readPage();
            }

            case 'browser_click': {
                const target = getBrowserToolTarget();
                if (!target) return BROWSER_TOOL_UNAVAILABLE;
                if (typeof args.selector !== 'string' || !args.selector.trim()) {
                    return 'Error: browser_click needs a selector string.';
                }
                onLog?.(`Clicking in browser: ${args.selector}`);
                return await target.click(args.selector);
            }

            case 'browser_fill': {
                const target = getBrowserToolTarget();
                if (!target) return BROWSER_TOOL_UNAVAILABLE;
                if (typeof args.selector !== 'string' || !args.selector.trim()) {
                    return 'Error: browser_fill needs a selector string.';
                }
                if (typeof args.value !== 'string') {
                    return 'Error: browser_fill needs a value string.';
                }
                onLog?.(`Filling in browser: ${args.selector}`);
                return await target.fill(args.selector, args.value);
            }

            case 'browser_screenshot': {
                const target = getBrowserToolTarget();
                if (!target) return BROWSER_TOOL_UNAVAILABLE;
                onLog?.('Screenshotting the current page...');
                return await target.screenshot();
            }

            case 'browser_get_state': {
                const target = getBrowserToolTarget();
                if (!target) return BROWSER_TOOL_UNAVAILABLE;
                onLog?.('Describing the current page...');
                return await target.getState();
            }

            case 'browser_search': {
                const target = getBrowserToolTarget();
                if (!target) return BROWSER_TOOL_UNAVAILABLE;
                if (typeof args.query !== 'string' || !args.query.trim()) {
                    return 'Error: browser_search needs a query string.';
                }
                onLog?.(`Searching the web: ${args.query}`);
                return await target.search(args.query);
            }

            default:
                return `Unknown tool: ${name}`;
        }
    } catch (error) {
        onLog?.(`Tool Execution Error: ${error instanceof Error ? error.message : String(error)}`);
        return `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`;
    }
}
