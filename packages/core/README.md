# @geogiseo/core

GEOgiseo의 공유 코어. 순수 TypeScript(입출력 없음)로, 앱과 MCP 서버가 함께
재사용한다. 자세한 설계 배경은 [../../docs/DESIGN.md](../../docs/DESIGN.md) 참고.

## 담당 범위

- **노트 파싱/직렬화** (`note.ts`) — 마크다운 ↔ `LocationNote`. Obsidian Map View
  호환: `location: [lat, lng]`(배열/레거시 문자열), 다중 마커 인라인 `[이름](geo:lat,lng)`.
  타임스탬프는 문자열로 보존, 알 수 없는 frontmatter는 그대로 유지(라운드트립 안정).
- **geo 유틸** (`geo.ts`) — haversine 거리, `[lat,lng]↔GeoJSON[lng,lat]` 전치,
  bounding-box. 좌표 순서는 전역 `[lat, lng]`, 지도 경계에서만 전치.
- **근접 인덱스** (`index-store.ts`) — 메모리 내 `NoteIndex`. bbox 1차 필터 +
  haversine로 `near(center, radius)`. 파일이 진실, 인덱스는 재생성 가능한 파생물.

## 사용 예

```ts
import { parseNote, serializeNote, NoteIndex } from '@geogiseo/core';

const note = parseNote(markdownText, 'notes/남산.md');
const idx = new NoteIndex();
idx.add(note);
const nearby = idx.near({ lat: 37.5665, lng: 126.978 }, 3000); // 3km 이내, 가까운 순
const markdown = serializeNote(note);
```

## 스크립트

- `pnpm build` — `tsc`로 `dist/` 생성
- `pnpm test` — vitest
- `pnpm typecheck` — 타입 검사만
