import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { tools, type ToolDeps } from './tools.js';

export function buildServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: 'mcp-mes-demarches', version: '0.1.0' });

  for (const tool of tools) {
    // registerTool attend `inputSchema` comme ZodRawShape (objet brut zod), PAS un z.object(...).
    // Le handler reçoit (args, extra) — on ignore extra, seul args nous intéresse.
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      (args) => tool.run(deps, args)
    );
  }

  return server;
}

export async function startStdio(deps: ToolDeps): Promise<void> {
  const server = buildServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
