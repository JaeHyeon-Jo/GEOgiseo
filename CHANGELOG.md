# 변경 기록

## 2026-11-01 — 즐겨찾기 보관함 저장

- 즐겨찾기가 앱 내부 `localStorage`에만 저장되어 재설치 시 사라지는 원인을 확인하고, 연결한 보관함 루트의 `geogiseo-places.json`에 저장하도록 수정했다. 기존 앱 데이터는 파일이 없을 때만 이관하고 같은 폴더를 다시 연결하면 파일에서 복원한다. 폴더 미연결 시 앱 내부 저장은 유지한다.
- 웹/Swift VaultAccess에 즐겨찾기 전용 읽기·쓰기를 추가했다. Swift는 고정 파일명·보안 스코프·파일 조정·원자적 쓰기·용량 제한·심볼릭 링크 제한을 적용한다. 기존 Markdown 노트 경로 정책은 유지한다.
- 파일이 있는 보관함은 파일 내용을 우선한다. 빈 목록 삭제 상태도 복원하며, 읽기/파싱 실패를 파일 없음으로 취급하지 않는다. 저장 중 중복 편집을 막고 실패하면 오류를 표시한다. 즐겨찾기 복원이 끝난 뒤 Watch 장소 목록과 대기 메모를 처리한다.
- 서버 전체 TS 빌드·타입 검사·테스트 통과. 웹 테스트는 기존 7개에 복원·이관·삭제·손상/권한/쓰기 실패 등을 검사하는 22개를 추가해 29개 통과했다. 최종 소스의 `ios:sync`와 커스텀 플러그인 3개 등록도 확인했다. Apple 컴파일·원격 Verify·실기기 재설치·TestFlight 배포는 이번 변경에 대해 아직 확인하지 않았다.

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
