# 변경 기록

## 2026-11-07 — Watch 자동 입력 화면 제거

- 원치 않는 메모 입력 팝업에 대한 피드백으로 컴플리케이션의 자동 입력 시트와 포커스를 제거했다. 컴플리케이션은 기존 마이크 버튼 화면을 열고 입력은 버튼으로 시작한다. Apple 빌드와 실기기는 미검증이다.

## 2026-11-07 — 문서 스와이프 뒤로가기

- 문서 상세에서 왼쪽 가장자리의 오른쪽 스와이프로 목록에 돌아가는 제스처를 추가했다. 짧은 이동, 세로 스크롤, 다중 터치는 제외한다. 서버 빌드·타입 검사·테스트와 `ios:sync` 통과, 실기기는 미검증이다.
- PR #7의 Verify는 이후 Watch 단위 테스트까지 전체 성공했고 해당 main 커밋의 Xcode Cloud 상태도 success로 확인했다. TestFlight 설치 가능 여부는 미확인이다.

## 2026-11-07 — 문서 화면 변경 main 반영

- [PR #7](https://github.com/JaeHyeon-Jo/GEOgiseo/pull/7)을 main `1ef84ea22344bf81289f268a2e409ee31e680acc`에 squash 머지했다. [Verify](https://github.com/JaeHyeon-Jo/GEOgiseo/actions/runs/42356494923)의 웹 검증과 iPhone·Watch 빌드는 성공했고 Watch 테스트는 진행 중이다. 새 Cloud 빌드는 pending이며 TestFlight·실기기는 미확인이다.

## 2026-11-07 — 문서 목록과 Markdown 표시

- 문서 목록을 둥근 버튼 대신 구분선으로 정리하고 본문에 Markdown·GFM 렌더링을 적용했다. frontmatter는 계속 숨기고 HTML은 실행하지 않는다. 위키링크와 로컬 첨부는 지원하지 않는다.
- 서버 전체 빌드·타입 검사·테스트와 `ios:sync` 통과. 원격 CI 및 iPhone 실기기 검증은 아직 하지 않았다.

## 2026-11-07 — 문서·Watch 변경 검증 및 main 반영

- 최초 원격 검증이 `iOS-27-1-iPhone19` 형태의 새 런타임 식별자를 숫자로 변환하다 실패해 시뮬레이터 선택 코드를 수정했다. [Verify 42353035525](https://github.com/JaeHyeon-Jo/GEOgiseo/actions/runs/42353035525)에서 웹 검증·iPhone/Watch 빌드·Watch 단위 테스트 통과.
- 사용자 요청에 따라 [PR #6](https://github.com/JaeHyeon-Jo/GEOgiseo/pull/6)을 squash 머지했다. main `3eec4af32b0be4a5b76627d876a61f920afd052c`. Cloud 빌드 `1af3e237-d85a-4c39-9f10-591a27f6b62c` pending으로 자동 실행을 확인했다. 최종 결과와 TestFlight 설치 가능 여부는 미확인이다. 공개 저장소는 그대로 유지했으며 추후 비공개 전환은 별도 작업이다.

## 2026-11-07 — Watch 입력 화면 바로 열기 시도

- 기존 거기서 컴플리케이션 URL을 받으면 별도 입력 시트를 열고 텍스트 필드에 자동 포커스를 요청한다. 입력 완료 시 기존 WatchStore 저장·전송 경로를 사용한다. 앱 내 수동 기록 버튼은 유지한다.
- Apple 플랫폼 문서상 포커스 요청은 가능하지만 받아쓰기가 즉시 시작된다고 보장할 근거는 없다. Apple 컴파일, Watch 화면·받아쓰기·저장·취소·전송은 미검증이다.

## 2026-11-07 — 문서 폴더와 Watch 입력 검토

- 두 번째 탭을 읽기 전용 문서 폴더로 바꿨다. 저장 보관함과 독립적으로 폴더를 선택하고 하위 Markdown 문서를 읽으며 iOS는 별도 북마크를 복원한다. 원본은 수정하지 않고 frontmatter를 숨긴 Markdown 원문을 표시한다. 실패한 문서 수와 폴더 오류를 표시한다.
- Watch의 기존 컴플리케이션·TextFieldLink·App Intent 및 Apple의 WidgetKit 입력 제한과 단축어 실행 경로를 검토했다. 바로 받아쓰기의 실기기 동작은 검증하지 못해 Watch 코드는 변경하지 않았다.
- 서버 전체 빌드·타입 검사·테스트 및 iOS 자산 동기화 통과. Apple 컴파일·원격 CI·TestFlight·실기기 검증은 미실시.

## 2026-11-01 — 즐겨찾기 보관함 저장

- 즐겨찾기가 앱 내부 `localStorage`에만 저장되어 재설치 시 사라지는 원인을 확인하고, 연결한 보관함 루트의 `geogiseo-places.json`에 저장하도록 수정했다. 기존 앱 데이터는 파일이 없을 때만 이관하고 같은 폴더를 다시 연결하면 파일에서 복원한다. 폴더 미연결 시 앱 내부 저장은 유지한다.
- 웹/Swift VaultAccess에 즐겨찾기 전용 읽기·쓰기를 추가했다. Swift는 고정 파일명·보안 스코프·파일 조정·원자적 쓰기·용량 제한·심볼릭 링크 제한을 적용한다. 기존 Markdown 노트 경로 정책은 유지한다.
- 파일이 있는 보관함은 파일 내용을 우선한다. 빈 목록 삭제 상태도 복원하며, 읽기/파싱 실패를 파일 없음으로 취급하지 않는다. 저장 중 중복 편집을 막고 실패하면 오류를 표시한다. 즐겨찾기 복원이 끝난 뒤 Watch 장소 목록과 대기 메모를 처리한다.
- 서버 전체 TS 빌드·타입 검사·테스트 통과. 웹 테스트는 기존 7개에 복원·이관·삭제·손상/권한/쓰기 실패 등을 검사하는 22개를 추가해 29개 통과했다. 최종 소스의 `ios:sync`와 커스텀 플러그인 3개 등록도 확인했다. 아래 원격 검증·머지 결과까지 확인했으며 실기기 재설치·TestFlight 설치 가능 여부는 미확인이다.

- [PR #5](https://github.com/JaeHyeon-Jo/GEOgiseo/pull/5), 검증 head `e95aef7b86318a77b6caac66c7a926565811a73c`. [Verify run 41254904251](https://github.com/JaeHyeon-Jo/GEOgiseo/actions/runs/41254904251) 성공: TS 테스트 69개, Xcode 27.1의 iPhone 빌드(Watch 포함), Watch 단위 테스트 4개 통과. 최초 Watch 시뮬레이터 실행 오류(`Application has termination assertions`)는 코드 변경 없이 실패 작업을 재시도해 통과했다. 로그는 Git 제외 `.local/verification-favorites-20261101/`에 보관한다.
- 사용자 “진행해” 승인으로 검증 head를 지정해 PR #5를 main에 squash 머지했다. 머지 커밋 `816649da172dc24da5b1e2dfb2ce0f51de5aaf18`, 원격 PR merged/closed·서버 main fast-forward·검증 head와 파일 트리 동일 확인. 새 커밋의 Cloud 상태 pending 및 빌드 `2664be47-8ec2-4577-a869-b81798084448` 연결로 자동 실행 시작을 확인했다. 최종 빌드·TestFlight 설치 가능 여부는 미확인이다. 결과 문서만을 위해 main을 추가 push하지 않는다.
- GitHub Actions 후속 확인: 최신 Verify attempt 2와 [main 웹 배포 41255757859](https://github.com/JaeHyeon-Jo/GEOgiseo/actions/runs/41255757859)의 build/deploy 모두 성공했다. 오류 제보에 따라 attempt 1의 실패 이력과 최종 결과를 구분해 재확인했으며, 새 실패는 확인되지 않아 코드 변경이나 재실행 없이 결과만 로컬에 기록했다.

## 2026-11-01 — 서버 원격 개발 환경

- D+Day iOS를 참고해 `/home/isidol11/projects/geogiseo-ios`에 SSH 체크아웃을 만들고 저장소별 SSH·Git 작성자 설정을 적용했다.
- 프로젝트 내부 도구·캐시로 pnpm 10.33.0을 실행하는 `scripts/pnpm.sh`를 추가했다. 잠금 파일을 유지해 의존성을 설치한다.
- PR/수동 `Verify`에 전체 TS 검증, Xcode 27 iPhone 빌드·Watch 단위 테스트를 구성했다. 기존 Pages·Cloud 배포 연결·앱 식별자는 유지했다.
- 기존 `docs/XCODE_MACBOOK.md` 인수인계를 루트 `AI_CONTEXT.md`로 통합하고 `AGENTS.md`와 현재 서버·Mac 안내를 추가했다. 오래된 임시 브랜치·`apps/web` 경로·네이티브 프로젝트 신규 생성 설명은 현재 절차로 교체했다.
- 시작 main `3988990`의 Cloud 상태 success 확인. TestFlight 설치·실기기 검증과 구분한다.
- 서버 검증: 잠금 파일 의존성 설치·전체 TS 빌드·타입 검사·테스트 통과. `ios:sync` 후 로컬 Swift 플러그인 3개 등록, YAML·내장 Python·plist·스킴·문서 링크·diff 검사 통과.
- [PR #4](https://github.com/JaeHyeon-Jo/GEOgiseo/pull/4)의 코드 `4a9ce78`는 [Verify run 41252896587](https://github.com/JaeHyeon-Jo/GEOgiseo/actions/runs/41252896587)에서 전체 성공했다. TS 테스트 47개(core 27·web 7·MCP 13), Xcode 27.1·iOS 27.1 iPhone Duo 빌드(Watch 포함), watchOS 27.0 Apple Watch Ultra 4의 Swift Testing 4개 통과. 결과 로그는 Git 제외 `.local/verification-20261101/`에 보관했다. 이후 검증 결과만 기록한 문서 커밋은 소스·워크플로를 바꾸지 않아 CI를 반복하지 않는다.
- main 머지 시도는 자동 승인 검토가 거절했다. 사유는 기본 브랜치 반영이 기존 Pages·Xcode Cloud 배포를 시작할 수 있어 명시적 머지 승인이 필요하다는 것이다. main은 `3988990` 그대로이며 PR은 검증 완료·open 상태로 보존한다. 새 배포는 실행하지 않았다.
- 이후 사용자 “응 해봐” 승인으로 위 거절이 해소됐다. 최신 head `4c4023e`를 지정해 PR #4를 main에 머지했다. 머지 커밋 `b79f8235feae4ebe5c14d665c4444a8820e93dc3`, 원격 PR merged/closed·서버 main fast-forward 확인. 검증한 `4a9ce78`과 앱·빌드 설정·워크플로는 동일하며 문서 2개만 다르다. 새 커밋의 `GEOgiseo | GEOgiseo` pending·Cloud 빌드 `d6e66d2a-e7a5-4970-9446-fd65aa7fe601` 연결로 자동 실행 시작을 확인했다. 최종 빌드·TestFlight 설치 가능 여부는 아직 미확인이다. 머지 결과 문서는 추가 main push 없이 서버 로컬에 기록한다.
