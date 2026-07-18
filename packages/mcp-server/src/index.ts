#!/usr/bin/env node
/**
 * GEOgiseo MCP 서버 진입점 (stdio 전송).
 *
 * 사용법:
 *   geogiseo-mcp <vault-폴더>
 *   GEOGISEO_VAULT=<vault-폴더> geogiseo-mcp
 *
 * stdout은 JSON-RPC 전용이므로 로그는 stderr로 출력한다.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Vault } from './vault.js';
import { createServer } from './tools.js';

async function main(): Promise<void> {
  const dir = process.env.GEOGISEO_VAULT ?? process.argv[2];
  if (!dir) {
    console.error(
      '사용법: geogiseo-mcp <vault-폴더>  (또는 GEOGISEO_VAULT 환경변수)',
    );
    process.exit(1);
  }

  const server = createServer(new Vault(dir));
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`geogiseo-mcp: vault=${dir} 준비됨`);
}

main().catch((err: unknown) => {
  console.error('geogiseo-mcp 시작 실패:', err);
  process.exit(1);
});
