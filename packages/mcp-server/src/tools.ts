/**
 * MCP 도구 정의. @geogiseo/core의 파싱·geo 로직과 Vault 파일 계층을 조합해
 * 위치 노트를 생성·검색·목록·조회하는 4개 도구를 등록한다.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { LocationNote } from '@geogiseo/core';
import { Vault, slugify } from './vault.js';

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

const text = (s: string, isError = false): ToolResult => ({
  content: [{ type: 'text', text: s }],
  ...(isError ? { isError: true } : {}),
});

function describeLocation(note: LocationNote): string {
  if (note.location) return `[${note.location.lat}, ${note.location.lng}]`;
  if (note.locations.length > 0) return `마커 ${note.locations.length}개`;
  return '위치 없음';
}

/** vault를 대상으로 동작하는 GEOgiseo MCP 서버를 구성한다. */
export function createServer(vault: Vault): McpServer {
  const server = new McpServer({ name: 'geogiseo', version: '0.0.0' });

  server.registerTool(
    'create_location_note',
    {
      title: '위치 노트 생성',
      description:
        '주어진 좌표(위도/경도)에 묶인 새 마크다운 노트를 vault에 만든다. 파일명은 날짜와 제목에서 자동 생성되며 충돌 시 접미사를 붙인다.',
      inputSchema: {
        title: z.string().describe('노트 제목'),
        lat: z.number().describe('위도'),
        lng: z.number().describe('경도'),
        body: z.string().optional().describe('본문(마크다운). 생략 가능'),
        tags: z.array(z.string()).optional().describe('태그 목록'),
        place: z.string().optional().describe('장소 이름'),
        captured_at: z
          .string()
          .optional()
          .describe('ISO 8601 시각. 생략 시 현재 시각'),
      },
    },
    async (args): Promise<ToolResult> => {
      const capturedAt = args.captured_at ?? new Date().toISOString();
      const note: LocationNote = {
        title: args.title,
        location: { lat: args.lat, lng: args.lng },
        locations: [],
        capturedAt,
        ...(args.place ? { place: args.place } : {}),
        tags: args.tags ?? [],
        extraFrontmatter: {},
        body: args.body ?? '',
      };
      const date = capturedAt.slice(0, 10);
      note.path = await vault.uniquePath(`${date}-${slugify(args.title)}.md`);
      const written = await vault.write(note);
      return text(`생성됨: ${written}`);
    },
  );

  server.registerTool(
    'search_notes_near',
    {
      title: '근처 노트 검색',
      description:
        '중심 좌표에서 반경(미터) 안의 위치 노트를 가까운 순으로 반환한다.',
      inputSchema: {
        lat: z.number().describe('중심 위도'),
        lng: z.number().describe('중심 경도'),
        radius: z.number().positive().describe('반경(미터)'),
        limit: z.number().int().positive().optional().describe('최대 결과 수'),
      },
    },
    async (args): Promise<ToolResult> => {
      const idx = await vault.buildIndex();
      let results = idx.near({ lat: args.lat, lng: args.lng }, args.radius);
      if (args.limit) results = results.slice(0, args.limit);
      if (results.length === 0) return text('반경 내 노트 없음');
      const lines = results.map(
        (r) =>
          `- ${r.note.path} · ${Math.round(r.distanceMeters)}m · ${r.note.title ?? '(제목 없음)'}`,
      );
      return text(lines.join('\n'));
    },
  );

  server.registerTool(
    'list_notes',
    {
      title: '노트 목록',
      description: 'vault의 위치 노트 목록을 반환한다. 태그로 필터할 수 있다.',
      inputSchema: {
        tag: z.string().optional().describe('이 태그를 가진 노트만'),
        limit: z.number().int().positive().optional().describe('최대 결과 수'),
      },
    },
    async (args): Promise<ToolResult> => {
      let notes = await vault.readAll();
      if (args.tag) notes = notes.filter((n) => n.tags.includes(args.tag as string));
      if (args.limit) notes = notes.slice(0, args.limit);
      if (notes.length === 0) return text('노트 없음');
      const lines = notes.map(
        (n) => `- ${n.path} · ${describeLocation(n)} · ${n.title ?? '(제목 없음)'}`,
      );
      return text(lines.join('\n'));
    },
  );

  server.registerTool(
    'get_note',
    {
      title: '노트 조회',
      description: 'vault 루트 기준 상대 경로로 단일 노트의 원문(마크다운)을 반환한다.',
      inputSchema: {
        path: z.string().describe('vault 루트 기준 상대 경로 (예: notes/남산.md)'),
      },
    },
    async (args): Promise<ToolResult> => {
      try {
        return text(await vault.readRaw(args.path));
      } catch {
        return text(`노트를 찾을 수 없음: ${args.path}`, true);
      }
    },
  );

  return server;
}
