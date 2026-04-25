import { SessionManager } from '../../../src/core/SessionManager';

export const sessionTools = [
    {
        name: "seal_session",
        description: "Seal the current working session. Call this tool when you are about to hand off the task to another AI agent, or when the user asks you to save the current progress.",
        inputSchema: {
            type: "object",
            properties: {
                history: {
                    type: "string",
                    description: "The full chat history or a comprehensive summary of the conversation that led to the current state. Provide as much detail as possible so the next AI agent can seamlessly continue."
                },
                files_referenced: {
                    type: "array",
                    items: { type: "string" },
                    description: "A list of files that were heavily involved in the current session."
                }
            },
            required: ["history"]
        }
    }
];

export async function handleSessionTool(name: string, args: any, workspaceRoot: string) {
    if (name === 'seal_session') {
        try {
            const manager = new SessionManager(workspaceRoot);
            
            // Build a string that includes the history and referenced files
            let fullHistory = args.history || '';
            if (args.files_referenced && args.files_referenced.length > 0) {
                fullHistory += '\n\n### Referenced Files\n' + args.files_referenced.map((f: string) => `- ${f}`).join('\n');
            }

            const savedPath = manager.saveSession({ history: fullHistory });
            if (savedPath) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Successfully sealed session at ${savedPath}. The next AI agent can now resurrect it.`
                        }
                    ]
                };
            } else {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to seal session.`
                        }
                    ],
                    isError: true
                };
            }
        } catch (e: any) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error sealing session: ${e.message}`
                    }
                ],
                isError: true
            };
        }
    }

    throw new Error(`Unknown session tool: ${name}`);
}
