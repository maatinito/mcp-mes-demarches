#!/usr/bin/env node
import { loadConfig } from './config.js';
import { realDeps } from './tools.js';
import { startStdio } from './server.js';

async function main() {
  const config = loadConfig();
  await startStdio(realDeps(config));
}

main().catch((err) => {
  console.error('[mcp-mes-demarches] erreur fatale :', err instanceof Error ? err.message : err);
  process.exit(1);
});
