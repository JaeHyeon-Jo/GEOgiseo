# 변경 기록

## 2026-11-01 — 서버 원격 개발 환경

- D+Day iOS를 참고해 `/home/isidol11/projects/geogiseo-ios`에 SSH 체크아웃을 만들고 저장소별 SSH·Git 작성자 설정을 적용했다.
- 프로젝트 내부 도구·캐시로 pnpm 10.33.0을 실행하는 `scripts/pnpm.sh`를 추가했다. 잠금 파일을 유지해 의존성을 설치한다.
- PR/수동 `Verify`에 전체 TS 검증, Xcode 27 iPhone 빌드·Watch 단위 테스트를 구성했다. 기존 Pages·Cloud 배포 연결·앱 식별자는 유지했다.
- 기존 `docs/XCODE_MACBOOK.md` 인수인계를 루트 `AI_CONTEXT.md`로 통합하고 `AGENTS.md`와 현재 서버·Mac 안내를 추가했다. 오래된 임시 브랜치·`apps/web` 경로·네이티브 프로젝트 신규 생성 설명은 현재 절차로 교체했다.
- 시작 main `3988990`의 Cloud 상태 success 확인. TestFlight 설치·실기기 검증과 구분한다.
- 서버 검증: 잠금 파일 의존성 설치·전체 TS 빌드·타입 검사·테스트 통과. `ios:sync` 후 로컬 Swift 플러그인 3개 등록, YAML·내장 Python·plist·스킴·문서 링크·diff 검사 통과. Apple 검증은 원격 CI 확인 진행 중.
