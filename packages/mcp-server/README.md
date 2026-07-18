# @geogiseo/mcp-server

마크다운 폴더(vault)를 대상으로 위치 노트를 생성·검색·조회하는 MCP 서버.
`@geogiseo/core`의 파싱·geo 로직을 그대로 재사용한다. 설계 배경은
[../../docs/DESIGN.md](../../docs/DESIGN.md) 참고.

폴더 안의 `.md` 파일이 진실 공급원이며, 옵시디언과 같은 폴더를 가리키면
AI가 만든 노트가 옵시디언에도 그대로 보인다.

## 도구

| 도구 | 인자 | 설명 |
|---|---|---|
| `create_location_note` | `title, lat, lng, body?, tags?, place?, captured_at?` | 좌표에 묶인 새 노트 생성. 파일명은 `날짜-제목.md` 자동 생성 |
| `search_notes_near` | `lat, lng, radius, limit?` | 반경(m) 안 노트를 가까운 순으로 |
| `list_notes` | `tag?, limit?` | 노트 목록(태그 필터) |
| `get_note` | `path` | 단일 노트 원문(마크다운) |

## 실행

```bash
pnpm build
node dist/index.js /경로/내-vault
# 또는
GEOGISEO_VAULT=/경로/내-vault node dist/index.js
```

## MCP 클라이언트 연결 (예: Claude Desktop)

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "geogiseo": {
      "command": "node",
      "args": ["/절대경로/GEOgiseo/packages/mcp-server/dist/index.js"],
      "env": { "GEOGISEO_VAULT": "/절대경로/내-vault" }
    }
  }
}
```

stdout은 JSON-RPC 전용이므로 로그는 stderr로 나간다.

## 스크립트

- `pnpm build` — `dist/` 생성
- `pnpm start` — 서버 실행
- `pnpm test` — vitest (Vault 파일 왕복 + in-memory 클라이언트로 end-to-end)
- `pnpm typecheck` — 타입 검사만
