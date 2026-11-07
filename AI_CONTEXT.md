# GEOgiseo — AI 작업 맥락

최종 갱신: 2026-11-07. 작업 전에 읽고 의미 있는 작업 후 갱신한다. 과거 변경 경위는 `CHANGELOG.md`에 기록한다.

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

- 작업 브랜치 `feature/document-swipe-back`: 문서 상세 화면의 왼쪽 가장자리에서 오른쪽으로 밀면 목록으로 돌아간다. 세로 이동·짧은 이동·다중 터치는 제외한다. 서버 전체 빌드·타입 검사·테스트 및 `ios:sync` 통과. iPhone 실기기 제스처 및 원격 CI는 미검증이다.
- 같은 브랜치에서 Watch 컴플리케이션이 띄우던 자동 메모 입력 시트·포커스를 제거했다. `geogiseo://record`는 기존 마이크 버튼 기록 화면으로 이동하고 위치를 요청한다. 실제 Watch 화면·입력과 Apple 빌드는 미검증이다.
- [PR #7](https://github.com/JaeHyeon-Jo/GEOgiseo/pull/7)을 사용자 요청으로 squash 머지했다. main `1ef84ea22344bf81289f268a2e409ee31e680acc`, 검증 head `a7c7ebcbaafbd7b501ae5e26f650ce77cd0dfded`. [Verify 42356494923](https://github.com/JaeHyeon-Jo/GEOgiseo/actions/runs/42356494923)은 머지 당시 Watch 단위 테스트가 진행 중이었으나 이후 전체 성공했다. [Xcode Cloud 빌드](https://appstoreconnect.apple.com/teams/7b082e5e-b72d-483e-aef2-ba1ba57e9d43/apps/6829224561/ci/builds/6e7aea86-d606-4623-abdc-7a0a651a38d4)의 커밋 상태도 success다. TestFlight 및 실기기는 미확인이다.
- 문서 탭 목록의 둥근 버튼 테두리를 제거하고 구분선 형태로 바꿨다. 본문은 frontmatter를 숨긴 뒤 Markdown 및 GFM 표·체크 목록을 렌더링한다. HTML은 실행하지 않는다. Obsidian 위키링크·로컬 첨부 연결은 별도 구현하지 않았다. 서버 전체 빌드·타입 검사·테스트와 `ios:sync` 통과. 원격 CI·iPhone 실기기 화면은 미검증이다.
- [PR #6](https://github.com/JaeHyeon-Jo/GEOgiseo/pull/6)을 사용자 요청으로 공개 저장소 main에 squash 머지했다. main 커밋 `3eec4af32b0be4a5b76627d876a61f920afd052c`, 검증 head `afa0e091cff68cf5b3cd36b46ab0bb80626de427`. 문서 탭과 Watch 입력 시도, 시뮬레이터 버전 파싱 수정 포함. 사용자는 저장소를 추후 비공개로 전환하겠다고 했으며 전환은 아직 하지 않았다.
- [Verify 42353035525](https://github.com/JaeHyeon-Jo/GEOgiseo/actions/runs/42353035525) 전체 성공: TS 빌드·타입 검사·테스트, iPhone 빌드(Watch 포함), Watch 단위 테스트. 최초 검증은 새 시뮬레이터 런타임의 접미사 파싱 오류로 Apple 컴파일 전에 실패했으며 워크플로 수정 후 통과했다.
- 새 main의 `GEOgiseo | GEOgiseo` 상태 pending 및 [Cloud 빌드 1af3e237-d85a-4c39-9f10-591a27f6b62c](https://appstoreconnect.apple.com/teams/7b082e5e-b72d-483e-aef2-ba1ba57e9d43/apps/6829224561/ci/builds/1af3e237-d85a-4c39-9f10-591a27f6b62c) 연결로 자동 실행을 확인했다. 빌드 최종 결과·TestFlight 처리·설치 가능 여부는 아직 확인하지 못했다. 이 결과 문서만을 위해 main을 추가 push하지 않는다.

- PR #6: iPhone 두 번째 탭을 날짜·장소 메모 목록에서 읽기 전용 문서 탭으로 교체했다. 메모 보관함과 별도로 폴더를 선택하고 하위 폴더의 Markdown 원문을 읽는다. iOS 북마크는 별도 저장하며 탭 진입·수동 새로고침 시 다시 읽는다. YAML frontmatter는 화면에서 숨기고 본문은 Markdown 원문으로 표시한다. 웹 폴더 핸들은 재실행 후 다시 선택해야 한다. 지도·메모 저장 경로는 유지한다.
- 서버 전체 빌드·타입 검사·테스트 및 `ios:sync` 통과. 읽기 폴더의 하위 문서·실패·권한 오류 테스트를 추가했다. Apple 빌드와 원격 CI 결과는 위와 같으며 TestFlight·실기기 폴더 권한/iCloud 반영은 미검증이다.
- Watch 컴플리케이션의 자동 입력 시도는 사용자 피드백으로 위 작업 브랜치에서 제거했다. 기존 앱 내 `TextFieldLink`는 유지한다. 이전의 iPhone 단축어 안내는 해당 App Intent가 Watch 전용이어서 검증되지 않았다.

- 서버 체크아웃·저장소별 SSH·Git 작성자 설정 완료. D+Day 저장소·전역 SSH/Git 설정은 변경하지 않았다. 기존 원격 개발·검증 환경은 PR #4에서 구성했다.
- 이전 main: `816649da172dc24da5b1e2dfb2ce0f51de5aaf18`([PR #5](https://github.com/JaeHyeon-Jo/GEOgiseo/pull/5) 머지). 사용자가 “메인에 머지 했어?” 후 “진행해”로 커밋·PR 검증·main 머지와 기존 Cloud 후속 빌드 확인을 승인했다. 원격 merged/closed·서버 main fast-forward 확인. 검증한 head `e95aef7b86318a77b6caac66c7a926565811a73c`와 머지 결과의 파일 트리는 동일하다.
- 즐겨찾기 폴더 저장 구현 완료. iOS VaultAccess와 웹 File System Access에 고정 JSON 파일 읽기·쓰기를 추가했다. 재연결/재실행/수동 새로고침으로 복원하며 추가·수정·삭제는 파일 저장 성공 후 화면에 반영한다. 복원 후 Watch 장소 동기화·대기 메모 처리를 진행한다. 기존 Markdown 경로 제한·보안 스코프·플러그인 등록은 유지한다.
- 서버 전체 TS 빌드·타입 검사·테스트, 최종 소스의 `ios:sync`·커스텀 Swift 플러그인 3개 등록·diff 검사 통과. 웹 테스트는 기존 7개에 복원·이관·빈 목록·손상/권한/쓰기 실패 등을 검사하는 22개를 추가했다.
- [Verify run 41254904251](https://github.com/JaeHyeon-Jo/GEOgiseo/actions/runs/41254904251) 전체 성공: TS 테스트 69개(core 27·web 29·MCP 13), Xcode 27.1·iOS 27.1 iPhone Duo 빌드(Watch 포함), watchOS 27.0 Apple Watch Ultra 4 단위 테스트 4개 통과. 최초 Apple 작업은 Watch 시뮬레이터의 `Application has termination assertions` 실행 오류로 테스트 시작 전에 실패했으며, 코드 변경 없이 실패 작업만 재시도해 통과했다. 로그는 Git 제외 `.local/verification-favorites-20261101/`에 보관한다.
- GitHub Actions 오류 제보 후 재확인: 최신 Verify의 attempt 2 및 [main Pages 배포 41255757859](https://github.com/JaeHyeon-Jo/GEOgiseo/actions/runs/41255757859)의 build/deploy 모두 success다. 최근 실행 목록에는 새 실패가 없으며, 확인된 실패는 위 Verify attempt 1의 Watch 실행 오류다. 사용자가 본 실패 알림이 해당 attempt인지 자체는 미확인이다. 추가 코드 수정·재실행·push는 하지 않았다.
- 새 main의 `GEOgiseo | GEOgiseo` pending과 [Cloud 빌드 2664be47-8ec2-4577-a869-b81798084448](https://appstoreconnect.apple.com/teams/7b082e5e-b72d-483e-aef2-ba1ba57e9d43/apps/6829224561/ci/builds/2664be47-8ec2-4577-a869-b81798084448) 연결로 자동 실행 시작을 확인했다. 빌드 최종 결과·TestFlight 설치 가능 여부는 미확인이다.
- 머지 결과 문서는 중복 배포를 피하도록 서버 로컬에 기록한다. 이 기록만을 위해 main을 추가 push하지 않는다.

## 미확인 사항과 다음 일

- 문서 폴더의 iCloud 접근·재시작 복원·변경/새로고침 및 Markdown 원문 가독성을 iPhone에서 검증한다. Watch 변경은 원격 Apple 빌드 후 실기기에서 컴플리케이션의 콜드/웜 실행, 입력 화면·받아쓰기 자동 시작 여부, 취소·반복·저장·오프라인 전송을 확인한다.

- main 반영에 따른 Cloud 자동 시작은 확인했다. 새 빌드 최종 상태·Archive 배포 후속 작업·TestFlight 그룹과 설치 가능 여부는 App Store Connect에서 별도 확인 필요. 커밋 success만으로 TestFlight 배포 완료를 단정하지 않는다.
- 후속 변경은 작업 브랜치 → PR Verify → main 반영 → 기존 Cloud 빌드/배포 확인 순서로 진행한다.
- 즐겨찾기 변경의 원격 Apple 컴파일·Watch 단위 테스트는 통과했다. 실기기에서 기존 즐겨찾기 이관 → 앱 삭제 → 같은 외부 폴더 재연결 → 장소·이모지·반경·태그 복원을 검증한다. 복원에는 폴더/JSON 파일이 남아 있어야 하며 앱 삭제로 함께 제거되는 폴더는 보존을 보장하지 않는다. 폴더 권한은 재설치 후 사용자가 다시 부여해야 한다. 실시간 다중 기기 병합은 구현하지 않았으며 외부 파일 변경은 재실행/수동 새로고침으로 반영한다.
- GPS·Vault 폴더 권한·iCloud 왕복·WatchConnectivity·컴플리케이션·단축어는 실제 기기로 확인한다.
