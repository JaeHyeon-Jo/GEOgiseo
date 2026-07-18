# @geogiseo/web

GEOgiseo 웹 MVP — React + Leaflet + File System Access API. 브라우저에서 로컬
마크다운 폴더를 열어 지도 위 노트를 보고, 만들고, 편집한다. 설계 배경은
[../../docs/DESIGN.md](../../docs/DESIGN.md) 참고.

## 배포

GitHub Pages로 자동 배포된다(`.github/workflows/deploy.yml`).

- 사이트: https://jaehyeon-jo.github.io/GEOgiseo/
- "폴더 열기"는 보안 컨텍스트(HTTPS)와 Chromium 계열 브라우저에서만 동작한다.

## 기능

- **📂 폴더 열기** — File System Access API로 로컬 폴더를 직접 읽고 쓴다. 옵시디언
  vault를 열면 같은 `.md` 파일을 공유한다. (Chrome/Edge 등 Chromium 계열, https 또는 localhost)
- **✨ 샘플 불러오기** — 폴더 없이 샘플 노트로 지도·목록·에디터를 체험. 미지원
  브라우저의 대체 경로이기도 하다.
- **지도** — Leaflet + OSM. 노트를 원형 마커로 표시. 지도를 클릭하면 그 지점 기준
  **근처 노트**를 반경(슬라이더) 안에서 가까운 순으로 보여준다.
- **에디터** — 제목/좌표/장소/태그/본문 편집. 지도 클릭으로 좌표 자동 입력.
  폴더 모드에선 `날짜-제목.md`로 저장되고, `location: [lat, lng]` frontmatter는
  옵시디언 Map View와 호환된다.

## 개발

```bash
pnpm dev       # vite 개발 서버
pnpm build     # 타입체크 + 프로덕션 빌드
pnpm preview   # 빌드 결과 미리보기
```

## 모바일 앱 (Capacitor · iOS)

이 웹앱을 Capacitor로 감싸 네이티브 iOS/Android 앱으로 만든다. UI 코드는 그대로
재사용하고, GPS 같은 네이티브 기능만 얹는다. `@capacitor/geolocation`은 웹에선
`navigator.geolocation`, 네이티브에선 실제 GPS를 자동으로 쓰므로 "📍 현재 위치
사용" 버튼은 브라우저와 앱에서 동일하게 동작한다(`src/geolocation.ts`).

iOS 네이티브 프로젝트는 **맥 + Xcode + CocoaPods**가 필요하므로 저장소에 넣지 않고
(`ios/`는 gitignore) 맥에서 생성한다:

```bash
pnpm --filter @geogiseo/web build   # 1. 웹 빌드(dist)
cd apps/web
npx cap add ios                      # 2. iOS 프로젝트 생성 (최초 1회)
npx cap sync ios                     # 3. 웹 자산 + 플러그인 동기화
# 4. ios/App/App/Info.plist 에 위치 권한 설명 추가(필수):
#    <key>NSLocationWhenInUseUsageDescription</key>
#    <string>현재 위치를 노트에 기록합니다</string>
npx cap open ios                     # 5. Xcode로 열어 실기기/시뮬레이터 실행
```

- 이후 웹 코드를 바꿀 때마다 `pnpm --filter @geogiseo/web build && npx cap sync ios`.
- Android는 `npx cap add android`로 동일하게(맥 불필요).
- GPS·카메라는 시뮬레이터에서 값이 가짜이므로 실제 검증은 실기기에서.

## 구현 메모

- `@geogiseo/core`를 재사용해 파싱·직렬화·근접 인덱스를 공유한다(앱 고유 지도 로직만 여기 둔다).
- `core` 내부 gray-matter가 전역 `Buffer`를 참조하므로 `main.tsx`에서 `buffer`
  패키지로 주입한다(`vite.config.ts`의 `global` 매핑 포함).
- Leaflet은 react-leaflet 없이 직접 제어하고, 마커는 이미지 에셋이 필요 없는
  `circleMarker`로 그린다(`MapView.tsx`).
- File System Access API 타입 보강은 `src/fs-access.d.ts`.
