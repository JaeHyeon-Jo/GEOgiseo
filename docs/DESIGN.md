# GEOgiseo 설계 문서

> 위치 기반 노트앱 — 로컬 우선(local-first), 높은 호환성, 옵시디언과 공존

## 1. 개요

GEOgiseo는 **위치에 묶인 노트**를 기록·탐색하는 앱이다. 현장에서 GPS로 위치를
기록하고, 지도 위에서 노트를 둘러보고, 특정 지점 근처의 노트를 검색한다.

출발점은 사용자가 이미 만든 옵시디언용 위치 기록 플러그인이며, 이를 독립적인
앱(모바일 우선 + 웹 + MCP)으로 확장하되 **옵시디언과 같은 마크다운 폴더를
공유하며 공존**하는 것을 목표로 한다.

### 목표 (Goals)

- **로컬 우선**: 데이터가 사용자 소유의 파일로 존재. 클라우드 벤더 락인 없음.
- **높은 호환성**: 노트는 순수 마크다운 → 텍스트 에디터·VS Code·git·다른 앱 어디서나 열림.
- **옵시디언 공존**: 옵시디언(및 Map View 플러그인)과 동일한 폴더/규약 공유.
- **모바일 우선**: 현장 GPS 기록이 1차 사용처. 웹 접속도 필수. 데스크톱은 이후.
- **MCP 제공**: AI 어시스턴트가 같은 폴더에 대해 노트를 생성·검색·조회.
- **사진 지원**: 노트에 사진 첨부. 사진의 EXIF에서 위치 자동 추출.

### 비목표 (Non-goals)

- 독자적 클라우드 백엔드/계정 시스템 구축 (동기화는 사용자의 클라우드 폴더에 위임).
- 실시간 협업 편집(멀티플레이어).
- SQL DB를 노트의 진실 공급원으로 삼는 것 (§6 참고).

## 2. 핵심 원칙 — "마크다운 폴더 = 단일 진실 공급원"

모든 노트는 **`.md` 파일 + YAML frontmatter**로 존재하며, 이 파일 폴더가 유일한
진실이다. 데이터베이스·인덱스·캐시는 전부 이 파일들로부터 **재생성 가능한
파생물**일 뿐 진실이 아니다.

```
        [ 마크다운 폴더 (좌표 frontmatter + 첨부 사진) ]  ← 단일 진실 공급원
          ↑              ↑                    ↑
   옵시디언 플러그인    앱(모바일/웹)         MCP 서버
```

옵시디언 플러그인·앱·MCP 서버는 모두 이 폴더를 공유하는 "얇은 클라이언트"다.

## 3. 데이터 모델 & frontmatter 스키마

옵시디언 **Map View** 커뮤니티 플러그인 규약과 호환되도록 설계한다. 좌표 순서는
**어디서나 위도(lat), 경도(lng)** 로 통일한다 (Leaflet의 `LatLng` 순서와도 일치).

### 단일 위치 노트 (기본)

```yaml
---
title: 남산 산책
location: [37.5512, 126.9882]   # [위도, 경도]
captured_at: 2026-07-17T09:14:00+09:00
place: 남산공원
accuracy: 8            # GPS 정확도(m), 선택
tags: [geogiseo, 산책]
---
남산 산책 중. 벚꽃이 아직 남아있다.

![[attachments/2026-07-17-남산-01.jpg]]
```

- 키는 **`location`** (단수), 값은 **YAML 리스트 `[lat, lng]`** — Obsidian 1.4+ Properties 형식.
- 레거시 문자열형 `location: "37.5512, 126.9882"` 도 **읽기** 지원.
- `captured_at`, `place`, `accuracy` 등 GEOgiseo 전용 키는 안전 — 옵시디언/Map View는
  모르는 frontmatter 키를 무시한다.

### 다중 마커 노트 (호환 읽기)

Map View는 여러 마커를 담을 때 빈 `locations:` 플래그 + 본문 인라인 링크를 쓴다.
GEOgiseo `core` 파서는 이 형식도 **읽어야** 한다.

```yaml
---
locations:
---
1지점: [한강](geo:37.5172,126.9966)
2지점: [여의도](geo:37.5219,126.9245)
```

- 인라인 형식: `[이름](geo:lat,lng)`. `locations:` 빈 키는 Map View가 전문 스캔을
  피하기 위한 플래그.

### 좌표 순서 주의

노트·앱 UI·Leaflet은 전부 **[lat, lng]**. 단, GeoJSON/MapLibre는 내부적으로
**[lng, lat]** 을 쓴다. 따라서 지도 어댑터의 경계에서만 전치(transpose)하고,
그 외 모든 곳에서는 [lat, lng]를 유지해 좌표 뒤집힘 버그를 원천 차단한다.

## 4. 사진 & 첨부 처리

마크다운은 사진을 **품지 않고 참조**한다. 사진은 별도 이미지 파일로 저장되고
마크다운이 임베드 링크로 가리킨다 — 이는 파일 기반의 약점이 아니라 **강점**이다
(사진이 그대로 다른 앱·갤러리에서 열리고, DB BLOB 락인이 없음).

```
notes/
├── 2026-07-17-남산-산책.md
└── attachments/
    └── 2026-07-17-남산-01.jpg
```

- 임베드: `![[attachments/…jpg]]` (옵시디언 위키링크) 또는 표준 `![alt](경로)`.
- **첨부 폴더 규약**: 옵시디언의 "첨부 파일 폴더" 설정과 경로 규칙(vault 루트 기준
  상대경로)을 맞춰 공존을 보장한다.

### EXIF 위치 자동 추출 ⭐

스마트폰 사진은 대개 EXIF에 GPS 좌표를 담고 있다. 사진 첨부 시 EXIF에서 좌표를
추출해 노트의 `location`을 자동으로 채운다 — 위치 기반 앱과 사진의 자연스러운 시너지.

### 사진 관련 설계 고려사항

- **모바일 placeholder 증폭**: 클라우드 폴더의 사진은 크기 때문에 "아직 다운로드
  안 됨" 상태가 잦다. **썸네일을 생성·캐시**하고 원본은 필요 시에만 내려받는다.
- **용량**: 업로드 시 리사이즈/압축 옵션 제공(선택).

## 5. 아키텍처

TypeScript 모노레포 + 공유 `core` 패키지.

```
packages/core/        ← 노트 모델, gray-matter 파싱/직렬화, geo 스키마,
                         거리/근접 쿼리, [lat,lng]↔GeoJSON 전치 헬퍼 (순수 TS, I/O 없음)
apps/web/  (+mobile)  ← React + 지도 UI. Capacitor로 iOS/Android + 웹 PWA를 한 코드베이스에서
packages/mcp-server/  ← core 재사용, 같은 로컬 폴더 대상 MCP 도구
```

`core`는 순수 로직(입출력 없음)이라 테스트가 쉽고, 앱과 MCP 서버가 파싱·geo 로직을
**그대로 재사용**한다.

## 6. 인덱스 전략 — SQLite는 "진실"이 아니라 "파생 캐시"

> 결정: **마크다운 = 진실, SQLite = 동기화하지 않는 로컬 전용·재생성 가능한 파생 인덱스**

SQL을 쓰느냐 마느냐가 아니라 **무엇으로 쓰느냐**가 핵심이다.

### 파생 인덱스로서의 SQLite — 채택 (규모가 커질 때)

마크다운이 진실인 채로, 조회 속도를 위한 **버릴 수 있는 사본**으로만 SQL을 쓴다.
로컬 우선·호환성을 하나도 깨지 않으면서 이득만 얻는다.

- **공간 쿼리 속도**: SQLite R-tree로 "내 근처 노트"를 전체 스캔 없이 조회. 노트가
  수천~수만 개여도 일정한 속도.
- **복합 쿼리**: 태그 + 날짜 범위 + 반경 + 전문검색(FTS5)을 한 번에.
- **모바일 성능 ⭐**: 클라우드 폴더의 마크다운은 콜드 스캔이 느리고 placeholder가
  많다. 로컬 인덱스가 있으면 파일을 다 안 읽어도 지도/목록을 즉시 그린다.
- **증분 갱신**: 파일 mtime을 추적해 바뀐 파일만 재파싱.

원칙: 인덱스는 **파일 변경 시 무효화·재생성 가능**해야 하고, **절대 클라우드로
동기화하지 않는다**(각 기기가 로컬에서 자체 생성).

### SQLite를 진실 공급원으로 쓰지 않는 이유

- **호환성 상실**: `.db`는 텍스트 에디터·git·다른 앱에서 못 연다.
- **옵시디언 공존 불가**: 옵시디언은 마크다운만 읽는다.
- **클라우드 폴더 동기화와 상극**: 단일 바이너리 DB를 iCloud/Dropbox로 동기화하면
  통짜 파일 충돌·손상 위험이 크다(옵시디언도 인덱스는 동기화하지 않는 이유).

### 규모별 적용

- MVP(개인 노트 수백~수천 개): **메모리 내 인덱스**(haversine + bounding-box)로 충분.
- 모바일(Phase 3)·대규모: **SQLite 파생 인덱스**(R-tree, mtime 기반 캐시)로 승격.

## 7. 모바일 + 클라우드 폴더 제약 (정직한 한계)

동기화는 **클라우드 폴더**(iCloud Drive / Dropbox / Google Drive)에 위임한다.
마크다운 폴더가 클라우드 동기 디렉터리에 있고 각 기기가 이를 동기화한다.
자체 동기화 서버는 두지 않는다.

**중요한 현실적 한계**: iOS에서 "옵시디언 모바일과 문자 그대로 같은 iCloud 폴더"는
**불가능**하다.

- `@capacitor/filesystem`은 iCloud 컨테이너를 지원하지 않으며(오픈 이슈 #33, #1354),
  앱 소유 위치만 접근 가능하다.
- iOS 샌드박싱상 외부 폴더는 **문서 선택기(document picker) + security-scoped
  bookmark** 로만 지속 접근 가능하다. 옵시디언 자신도 이 방식으로 외부 vault를 연다.
- 옵시디언 iOS vault는 옵시디언 전용 iCloud 컨테이너에 격리되어 다른 앱이 못 읽는다.

**채택 모델**:

- **데스크톱**: 클라우드 동기 폴더를 **직접 공유**. 옵시디언 데스크톱, GEOgiseo MCP
  서버, File System Access API 기반 웹 클라이언트가 동일 파일을 읽고 쓴다. 가장 강한
  상호운용 스토리 → 1순위 마일스톤.
- **모바일**: 사용자가 폴더 선택기로 공유 iCloud Drive/Dropbox 폴더에 **한 번 접근
  권한을 부여**하고, GEOgiseo가 bookmark를 저장해 재사용. 기기 간 동기화는 OS 파일
  프로바이더가 담당. → 같은 파일을 클라우드가 조율(앱 내 같은 핸들은 아님).
- **다뤄야 할 UX**: 지연 materialization(placeholder), 오프라인 동시 편집 시 쓰기 충돌.

## 8. 기술 스택 (웹 검증 완료)

| 영역 | 선택 | 근거 |
|---|---|---|
| 모노레포 | pnpm/npm workspaces + TypeScript | `core`를 앱·MCP가 공유 |
| frontmatter 파싱 | gray-matter | 표준, 옵시디언 호환 |
| 클라이언트 | **React + Capacitor** | 웹 우선 → PWA + iOS/Android를 한 빌드에서. Expo/RN은 웹이 2급, Flutter는 TS 재사용 포기 → 부적합 |
| 지도 | **Leaflet + OSM 래스터** (초기) → **MapLibre GL**(오프라인 벡터, 이후) | Leaflet은 빠른 MVP, 스왑 가능한 인터페이스 뒤에 두고 오프라인 필요 시 이전 |
| GPS | `@capacitor/geolocation` | — |
| 폴더 접근(모바일) | 문서 선택기 + security-scoped bookmark (Capawesome File Picker / 네이티브 shim) | core `@capacitor/filesystem`은 임의 폴더 불가 |
| 인덱스 | 메모리 → SQLite 파생 인덱스 | 파일이 진실, DB는 캐시 (§6) |
| MCP | TypeScript, `core` 재사용 | 로컬 폴더 대상 |

## 9. MCP 인터페이스

`core`를 임포트하는 TypeScript MCP 서버. 로컬 동기 폴더 경로를 대상으로 동작.

| 도구 | 설명 |
|---|---|
| `create_location_note(title, lat, lng, body?, tags?)` | 위치 노트 생성 |
| `search_notes_near(lat, lng, radius)` | 반경 내 노트 검색 |
| `list_notes(filter?)` | 노트 목록(태그·기간 필터) |
| `get_note(path)` | 단일 노트 조회 |

파싱·geo 로직은 §5 `core`와 §6 파생 인덱스를 그대로 재사용한다.

## 10. 단계별 로드맵

- **Phase 0 — `core`**: 노트 모델, 양방향 파서(`location` 배열/문자열 + 인라인 `geo:`),
  거리/근접 쿼리, 전치 헬퍼. 실제 옵시디언/Map View 샘플로 파서 테스트. I/O 없어 순수 테스트.
- **Phase 1 — 데스크톱/웹 MVP**: File System Access API로 클라우드 동기 폴더 직접 열기,
  Leaflet 지도, 노트 생성/편집, "클릭 지점 근처 노트". 옵시디언 공존을 데스크톱에서 즉시 증명.
- **Phase 2 — MCP 서버**: `core` 재사용, 같은 폴더 대상. §9 도구 구현 + 파생 인덱스.
- **Phase 3 — 모바일**: Phase 1 웹앱을 Capacitor로 래핑, `@capacitor/geolocation` GPS,
  폴더 선택기 + security-scoped bookmark 네이티브 shim, 사진 첨부 + EXIF 위치 추출,
  썸네일 캐시. (가장 불확실한 작업을 의도적으로 이 단계에 격리.)
- **Phase 4 — 하드닝**: Leaflet→MapLibre(오프라인 벡터), 편집 충돌 해결 UX,
  mtime 기반 인덱스 캐시, 데스크톱 패키징(Tauri/Electron).

각 단계가 `core`를 재사용하며 다음을 디리스크한다. 진짜 불확실한 작업(모바일 외부
폴더 접근)은 Phase 3에 격리되어, 이미 출시 가능한 데스크톱/웹 + MCP가 확보된 뒤라
모바일 난관이 프로젝트 전체를 막지 않는다.

## 11. 참고 (검증 출처)

- Obsidian Map View frontmatter 규약: `location: [lat, lng]`(Properties 형식), 레거시
  문자열형, 빈 `locations:` 플래그 + 인라인 `[이름](geo:lat,lng)` —
  [Map View quick-start](https://esm7.github.io/obsidian-map-view/quick-start.html),
  [esm7/obsidian-map-view](https://github.com/esm7/obsidian-map-view).
- `@capacitor/filesystem` iCloud 컨테이너 미지원:
  [capacitor-filesystem #33](https://github.com/ionic-team/capacitor-filesystem/issues/33),
  [capacitor-plugins #1354](https://github.com/ionic-team/capacitor-plugins/issues/1354).
- iOS 외부 폴더 접근(문서 선택기 + security-scoped bookmark):
  [Apple — Providing access to directories](https://developer.apple.com/documentation/uikit/providing-access-to-directories),
  [Capawesome File Picker](https://capawesome.io/plugins/file-picker/).
- Capacitor 웹 우선/PWA: [Capacitor PWA docs](https://capacitorjs.com/docs/web/progressive-web-apps).
- 지도 라이브러리: [MapLibre vs Leaflet](https://blog.jawg.io/maplibre-gl-vs-leaflet-choosing-the-right-tool-for-your-interactive-map/).
