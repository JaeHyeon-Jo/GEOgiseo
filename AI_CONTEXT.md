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
| `GEOgiseoApps/web/src/places.ts` | 즐겨찾기 JSON 검증·기존 앱 데이터 이관·보관함 저장/복원 |
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
6. 즐겨찾기는 연결한 보관함 루트의 `geogiseo-places.json`(`version: 1`, `places` 목록)을 원본으로 쓰고 기존 `localStorage` 키 `geogiseo-places`는 캐시로 유지한다. 파일이 없을 때만 앱 데이터를 이관하고 기존 파일(빈 목록 포함)이 있으면 파일을 우선한다. 읽기·파싱 오류 시 덮어쓰지 않으며 재시도 전 즐겨찾기 편집을 막는다. 보관함 미연결 상태는 앱 내부 저장만 한다. 폴더 변경 시 대상 파일을 불러오며, 대상 파일이 없으면 현재 캐시를 복사한다.

## 현재 상태

- 서버 체크아웃·저장소별 SSH·Git 작성자 설정 완료. D+Day 저장소·전역 SSH/Git 설정은 변경하지 않았다.
- 기준 main: `b79f8235feae4ebe5c14d665c4444a8820e93dc3`([PR #4](https://github.com/JaeHyeon-Jo/GEOgiseo/pull/4) 머지). 사용자가 main 머지·기존 Cloud 배포 진행을 승인했다. 원격 merged/closed와 서버 main fast-forward를 확인했다. 검증한 코드와 차이는 인수인계·변경 기록 2개 파일뿐이며 앱·워크플로는 동일하다.
- 새 main의 `GEOgiseo | GEOgiseo` pending과 [Cloud 빌드 d6e66d2a-e7a5-4970-9446-fd65aa7fe601](https://appstoreconnect.apple.com/teams/7b082e5e-b72d-483e-aef2-ba1ba57e9d43/apps/6829224561/ci/builds/d6e66d2a-e7a5-4970-9446-fd65aa7fe601) 연결로 자동 실행 시작을 확인했다. 빌드 최종 결과·TestFlight 설치 가능 여부는 미확인이다.
- 환경 구성: [PR #4](https://github.com/JaeHyeon-Jo/GEOgiseo/pull/4), 검증한 코드 `4a9ce787100061ce9f8c2a13cecd30d304477b60`.
- [Verify run 41252896587](https://github.com/JaeHyeon-Jo/GEOgiseo/actions/runs/41252896587) 전체 성공: Node 22의 TS 빌드·타입 검사·테스트 47개(core 27·web 7·MCP 13), Xcode 27.1의 iOS 27.1 iPhone Duo 빌드(Watch 포함)·watchOS 27.0 Apple Watch Ultra 4 단위 테스트 4개 통과. Watch xcresult 아티팩트 7일 보관.
- 서버에서도 잠금 파일 설치·전체 TS 빌드·타입 검사·테스트, `ios:sync`·커스텀 플러그인 3개 등록, YAML·내장 Python·plist·스킴·문서 링크·diff 검사 통과. 원격 로그는 Git 제외 `.local/verification-20261101/`에 보관한다.
- 이번 머지 결과 문서는 중복 배포를 피하도록 서버 로컬에 기록한다. 이 기록만을 위해 main을 추가 push하지 않는다.
- 현재 작업 브랜치 `fix/favorites-vault-persistence`: 사용자 요청에 따라 즐겨찾기 폴더 저장을 구현했다. iOS VaultAccess에 고정 JSON 파일 전용 읽기·원자적 쓰기를 추가하고 웹 File System Access에도 연결했다. 재연결/재실행/수동 새로고침으로 복원하며 추가·수정·삭제는 파일 저장 성공 후 화면에 반영한다. 즐겨찾기 복원 후 Watch 장소 동기화·대기 메모 처리를 진행한다. 기존 Markdown 경로 제한·보안 스코프·플러그인 등록은 유지한다.
- 이번 변경의 서버 검증: 전체 TS 빌드·타입 검사·테스트 통과, 웹 테스트 29개(기존 7 + 신규 22) 통과. 앱 캐시 초기화 후 복원·이관·폴더별 파일 우선·빈 목록·손상 파일·읽기/쓰기 실패·웹 파일 스트림 실패를 검사했다. 최종 소스의 `ios:sync`·커스텀 Swift 플러그인 3개 등록·diff 검사도 통과했다. Apple 컴파일·원격 Verify·실기기·이번 변경의 배포는 아직 미확인이다.
- 사용자가 “메인에 머지 했어?” 후 “진행해”로 즐겨찾기 변경의 커밋·PR 검증·main 머지와 기존 Cloud 후속 빌드 확인을 승인했다. 원격 Verify가 통과하면 해당 head를 지정해 머지하고, 결과는 추가 배포를 일으키지 않도록 로컬 문서에 기록한다.

## 미확인 사항과 다음 일

- main 반영에 따른 Cloud 자동 시작은 확인했다. 새 빌드 최종 상태·Archive 배포 후속 작업·TestFlight 그룹과 설치 가능 여부는 App Store Connect에서 별도 확인 필요. 커밋 success만으로 TestFlight 배포 완료를 단정하지 않는다.
- 후속 변경은 작업 브랜치 → PR Verify → main 반영 → 기존 Cloud 빌드/배포 확인 순서로 진행한다.
- 즐겨찾기 변경은 iOS `ios:sync` 후 원격 Verify/Mac에서 컴파일하고, 실기기에서 기존 즐겨찾기 이관 → 앱 삭제 → 같은 외부 폴더 재연결 → 장소·이모지·반경·태그 복원을 검증한다. 복원에는 폴더/JSON 파일이 남아 있어야 하며 앱 삭제로 함께 제거되는 폴더는 보존을 보장하지 않는다. 폴더 권한은 재설치 후 사용자가 다시 부여해야 한다. 실시간 다중 기기 병합은 구현하지 않았으며 외부 파일 변경은 재실행/수동 새로고침으로 반영한다.
- GPS·Vault 폴더 권한·iCloud 왕복·WatchConnectivity·컴플리케이션·단축어는 실제 기기로 확인한다.
