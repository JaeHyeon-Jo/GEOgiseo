# GEOgiseo — AI 작업 맥락

최종 갱신: 2026-11-01. 작업 전에 읽고 의미 있는 작업 후 갱신한다. 과거 변경 경위는 `CHANGELOG.md`에 기록한다.

## 프로젝트 목적

위치에 묶인 노트를 마크다운 파일로 저장하는 로컬 우선 앱. React·Capacitor iPhone 앱, SwiftUI Apple Watch 앱·컴플리케이션, 웹 미리보기와 로컬 Vault용 MCP 서버를 포함한다. 상세 설계는 `docs/DESIGN.md`이며 초기 계획과 현재 구현을 구분한다.

## 주요 구조

| 위치 | 역할 |
|---|---|
| `packages/core` | 노트 파싱·직렬화, 좌표, 근접 인덱스 |
| `packages/mcp-server` | 로컬 마크다운 Vault용 MCP 서버 |
| `GEOgiseoApps/web/src` | React 화면, 노트 편집, Vault·위치·네이티브 지도·Watch 연결 |
| `GEOgiseoApps/web/ios/App/App` | iPhone 앱, WatchSessionManager·WatchBridgePlugin |
| `GEOgiseoApps/web/ios/App/*Plugin.swift` | VaultAccess·NativeMap 네이티브 플러그인 |
| `GEOgiseoApps/web/ios/App/GeoWatch Watch App` | Watch 메모·위치·단축어 |
| `GEOgiseoApps/web/ios/App/GeoWatchComplication` | Watch 위젯·컴플리케이션 |
| `GEOgiseoApps/web/ios/App/App.xcworkspace` | CocoaPods를 포함한 Xcode 작업 공간 |
| `GEOgiseoApps/web/ios/App/ci_scripts` | 기존 Xcode Cloud 의존성 준비·배포 진단 |
| `GEOgiseoApps/web/scripts/patch-ios-plugins.mjs` | Capacitor 복사 후 Swift 플러그인 등록 복원 |
| `.github/workflows/verify.yml` | PR/수동 TS 검증 → iPhone 빌드·Watch 단위 테스트 |
| `.github/workflows/deploy.yml` | 기존 main 변경/수동 GitHub Pages 배포 |
| `scripts/pnpm.sh` | 서버의 프로젝트 내부 Corepack·pnpm 도우미 |

## 실행·검증

- 서버: `/home/isidol11/projects/geogiseo-ios`, 원격: `git@github.com:JaeHyeon-Jo/GEOgiseo.git`, 기본 브랜치: `main`.
- Node 22 이상·pnpm 10.33.0. 서버는 Node 24.22.1이며 `bash scripts/pnpm.sh`로 지정 버전을 쓴다.
- 설치: `bash scripts/pnpm.sh install --frozen-lockfile --store-dir .local/pnpm-store`.
- 검증 순서: `bash scripts/pnpm.sh -r build`, `bash scripts/pnpm.sh -r typecheck`, `bash scripts/pnpm.sh -r test`.
- 웹 개발: 코어 빌드 후 `bash scripts/pnpm.sh --filter @geogiseo/web dev --host 127.0.0.1`. 원격 접속은 SSH 터널.
- Apple 검증은 Xcode 27·iOS·watchOS SDK 필요. iPhone 최소 iOS 15.0, Watch 최소 watchOS 26.5. 공유 스킴: `GEOgiseo`, `GeoWatch Watch App`.
- 기존 Watch 단위 테스트 4개, UI 테스트는 별도. iPhone 테스트 타깃은 없다. Verify는 iPhone 빌드·Watch 단위 테스트를 실행한다.
- 상세 절차: `docs/REMOTE_DEVELOPMENT.md`.

## 중요한 결정

1. 기존 네이티브 프로젝트를 유지한다. 플랫폼 재생성·앱 식별자·서명 팀 변경 없이 기존 Xcode Cloud 연결을 사용한다.
2. 웹→iOS 반영은 `ios:sync`: 웹 빌드 → `cap copy ios` → Swift 플러그인 등록 복원. CocoaPods 설치는 Mac/Cloud에서 한다.
3. Pages 빌드의 `VITE_BASE=/GEOgiseo/`와 iOS의 `/`를 구분한다.
4. main 반영은 기존 Cloud 배포를 시작할 수 있다. PR Verify의 서명 없는 빌드·테스트와 구분한다.
5. 기존 인수인계 `docs/XCODE_MACBOOK.md`는 이 파일로 통합했다. 오래된 임시 브랜치·`apps/web` 경로·iOS 신규 생성 안내를 현재 실행 절차로 갱신했다.

## 현재 상태

- 서버 체크아웃·저장소별 SSH·Git 작성자 설정 완료. D+Day 저장소·전역 SSH/Git 설정은 변경하지 않았다.
- 시작 main: `3988990c61fc94e9359e3ada87a3c83078ff10bf`. 커밋 상태 `GEOgiseo | GEOgiseo` success 확인.
- 기존 Cloud 빌드: https://appstoreconnect.apple.com/teams/7b082e5e-b72d-483e-aef2-ba1ba57e9d43/apps/6829224561/ci/builds/b8c41b56-ffc3-43f4-af22-a71eff359fbf
- 구성 브랜치: `setup/remote-development`. 잠금 파일 설치·전체 TS 빌드·타입 검사·테스트 통과. `ios:sync` 실행과 커스텀 플러그인 3개 등록, 워크플로 YAML·내장 Python·plist·스킴·문서 링크·diff 검사 통과. Apple 빌드·Watch 테스트는 원격 Verify 확인 진행 중.

## 미확인 사항과 다음 일

- 실제 Cloud 시작 조건·배포 후속 작업·TestFlight 그룹과 설치 가능 여부는 App Store Connect에서 별도 확인 필요. 커밋 success만으로 TestFlight 배포 완료를 단정하지 않는다.
- 신규 Verify 원격 실행 결과를 확인하고 최종 상태를 기록한다. 서버 정적 검사만으로 Apple 빌드 성공을 주장하지 않는다.
- GPS·Vault 폴더 권한·iCloud 왕복·WatchConnectivity·컴플리케이션·단축어는 실제 기기로 확인한다.
