# GEOgiseo

위치 기반 노트앱 — 로컬 우선(local-first), 높은 호환성, 옵시디언과 공존.

위치에 묶인 노트를 현장에서 GPS로 기록하고, 지도 위에서 둘러보고, 특정 지점 근처의
노트를 검색한다. 노트는 순수 마크다운 파일로 저장되어 옵시디언·텍스트 에디터·git 등
어디서나 열린다. 모바일 우선이며 웹 접속과 MCP(AI 접근)를 함께 제공한다.

## 문서

- [설계 문서 (docs/DESIGN.md)](docs/DESIGN.md) — 데이터 모델, 아키텍처, 기술 스택,
  모바일/클라우드 폴더 제약, MCP 인터페이스, 단계별 로드맵.

## 구조 (pnpm 모노레포)

| 패키지 | 설명 | 상태 |
|---|---|---|
| [`packages/core`](packages/core) | 공유 코어 — 노트 파싱, geo 유틸, 근접 인덱스 (순수 TS) | ✅ Phase 0 |
| [`packages/mcp-server`](packages/mcp-server) | 마크다운 폴더 대상 MCP 서버 (AI 접근) | ✅ Phase 2 |
| [`apps/web`](apps/web) | React + Leaflet 웹 앱 (폴더 열기·지도·편집) | ✅ Phase 1 |

```bash
pnpm install
pnpm -r build      # 전체 빌드
pnpm -r test       # 전체 테스트
pnpm -r typecheck  # 전체 타입체크
```

로드맵의 다음 단계는 **Phase 3 — 모바일**(Capacitor + GPS + 사진/EXIF). 자세한 내용은 설계 문서 참고.
