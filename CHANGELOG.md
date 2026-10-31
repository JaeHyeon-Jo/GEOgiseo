# 변경 기록

## 2026-11-01 — 서버 원격 개발 환경

- D+Day iOS를 참고해 `/home/isidol11/projects/geogiseo-ios`에 SSH 체크아웃을 만들고 저장소별 SSH·Git 작성자 설정을 적용했다.
- 프로젝트 내부 도구·캐시로 pnpm 10.33.0을 실행하는 `scripts/pnpm.sh`를 추가했다. 잠금 파일을 유지해 의존성을 설치한다.
- PR/수동 `Verify`에 전체 TS 검증, Xcode 27 iPhone 빌드·Watch 단위 테스트를 구성했다. 기존 Pages·Cloud 배포 연결·앱 식별자는 유지했다.
- 기존 `docs/XCODE_MACBOOK.md` 인수인계를 루트 `AI_CONTEXT.md`로 통합하고 `AGENTS.md`와 현재 서버·Mac 안내를 추가했다. 오래된 임시 브랜치·`apps/web` 경로·네이티브 프로젝트 신규 생성 설명은 현재 절차로 교체했다.
- 시작 main `3988990`의 Cloud 상태 success 확인. TestFlight 설치·실기기 검증과 구분한다.
- 서버 검증: 잠금 파일 의존성 설치·전체 TS 빌드·타입 검사·테스트 통과. `ios:sync` 후 로컬 Swift 플러그인 3개 등록, YAML·내장 Python·plist·스킴·문서 링크·diff 검사 통과.
- [PR #4](https://github.com/JaeHyeon-Jo/GEOgiseo/pull/4)의 코드 `4a9ce78`는 [Verify run 41252896587](https://github.com/JaeHyeon-Jo/GEOgiseo/actions/runs/41252896587)에서 전체 성공했다. TS 테스트 47개(core 27·web 7·MCP 13), Xcode 27.1·iOS 27.1 iPhone Duo 빌드(Watch 포함), watchOS 27.0 Apple Watch Ultra 4의 Swift Testing 4개 통과. 결과 로그는 Git 제외 `.local/verification-20261101/`에 보관했다. 이후 검증 결과만 기록한 문서 커밋은 소스·워크플로를 바꾸지 않아 CI를 반복하지 않는다.
- main 머지 시도는 자동 승인 검토가 거절했다. 사유는 기본 브랜치 반영이 기존 Pages·Xcode Cloud 배포를 시작할 수 있어 명시적 머지 승인이 필요하다는 것이다. main은 `3988990` 그대로이며 PR은 검증 완료·open 상태로 보존한다. 새 배포는 실행하지 않았다.
