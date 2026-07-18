import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Vault } from '../src/vault.js';
import { createServer } from '../src/tools.js';

let dir: string;
let client: Client;

/** 도구 결과의 첫 텍스트 콘텐츠를 꺼낸다. */
function textOf(res: unknown): string {
  const content = (res as { content: Array<{ type: string; text?: string }> }).content;
  return content.map((c) => c.text ?? '').join('\n');
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'geogiseo-mcp-'));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer(new Vault(dir));
  await server.connect(serverTransport);
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
  await fs.rm(dir, { recursive: true, force: true });
});

describe('MCP 서버 (end-to-end)', () => {
  it('4개 도구를 노출한다', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_location_note',
      'get_note',
      'list_notes',
      'search_notes_near',
    ]);
  });

  it('create → 파일이 생기고 근처 검색에 잡힌다', async () => {
    const created = await client.callTool({
      name: 'create_location_note',
      arguments: {
        title: '남산 산책',
        lat: 37.5512,
        lng: 126.9882,
        tags: ['산책'],
        captured_at: '2026-07-17T09:14:00+09:00',
      },
    });
    const createdPath = textOf(created).replace('생성됨: ', '');
    expect(createdPath).toBe('2026-07-17-남산-산책.md');
    // 파일이 실제로 존재
    expect(await fs.readFile(path.join(dir, createdPath), 'utf8')).toContain(
      'location: [37.5512, 126.9882]',
    );

    const near = await client.callTool({
      name: 'search_notes_near',
      arguments: { lat: 37.5665, lng: 126.978, radius: 3000 },
    });
    expect(textOf(near)).toContain('2026-07-17-남산-산책.md');
    expect(textOf(near)).toContain('남산 산책');
  });

  it('list_notes는 태그로 필터한다', async () => {
    await client.callTool({
      name: 'create_location_note',
      arguments: { title: '가', lat: 1, lng: 1, tags: ['x'] },
    });
    await client.callTool({
      name: 'create_location_note',
      arguments: { title: '나', lat: 2, lng: 2, tags: ['y'] },
    });
    const filtered = await client.callTool({
      name: 'list_notes',
      arguments: { tag: 'x' },
    });
    expect(textOf(filtered)).toContain('가');
    expect(textOf(filtered)).not.toContain('나');
  });

  it('get_note는 원문을, 없는 경로는 오류를 반환', async () => {
    const created = await client.callTool({
      name: 'create_location_note',
      arguments: { title: '조회용', lat: 10, lng: 20 },
    });
    const p = textOf(created).replace('생성됨: ', '');
    const got = await client.callTool({ name: 'get_note', arguments: { path: p } });
    expect(textOf(got)).toContain('title: 조회용');

    const missing = await client.callTool({
      name: 'get_note',
      arguments: { path: 'nope.md' },
    });
    expect((missing as { isError?: boolean }).isError).toBe(true);
  });

  it('빈 vault에서 근처 검색은 없음 메시지', async () => {
    const near = await client.callTool({
      name: 'search_notes_near',
      arguments: { lat: 0, lng: 0, radius: 1000 },
    });
    expect(textOf(near)).toBe('반경 내 노트 없음');
  });
});
