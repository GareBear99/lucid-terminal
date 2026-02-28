import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

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

            default:
                return `Unknown tool: ${name}`;
        }
    } catch (error) {
        onLog?.(`Tool Execution Error: ${error instanceof Error ? error.message : String(error)}`);
        return `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`;
    }
}
