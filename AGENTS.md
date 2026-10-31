# AGENTS

1. 작업 전에 루트 `AI_CONTEXT.md`를 먼저 읽는다. 작업 후 구조·실행 방법·결정·현재 상태·다음 일을 갱신하고, 변경 경위는 `CHANGELOG.md`에 남긴다. 하위 폴더에 인수인계 문서를 중복 생성하지 않는다.
2. 확인한 사실과 미확인 사항, 서버 검증·원격 CI·TestFlight 배포·실기기 검증을 구분한다.
3. 서버 폴더는 `/home/isidol11/projects/geogiseo-ios`다. 저장소 전체를 담은 pnpm 모노레포이며 웹 경로는 `GEOgiseoApps/web`다.
4. pnpm 버전은 루트 `package.json`의 `packageManager`를 따른다. 서버에서는 `bash scripts/pnpm.sh`로 실행할 수 있다. 의존성은 `install --frozen-lockfile`로 설치하고 코어를 먼저 빌드한다.
5. iOS/Watch 네이티브 소스는 이미 Git으로 관리한다. `cap add ios`로 재생성하지 않는다. 웹 자산은 `pnpm --filter @geogiseo/web ios:sync`로 복사해 로컬 Swift 플러그인 등록을 보존한다. 직접 `cap copy`/`cap sync`만 실행하면 등록이 누락될 수 있다.
6. `App.xcworkspace`와 공유 스킴 `GEOgiseo`를 사용한다. 번들 ID·서명 팀·Watch 임베딩·Xcode Cloud manifest는 기존 배포 연결이므로 임의 변경하지 않는다.
7. 작업 트리를 확인하고 작업 브랜치에서 수정한다. main 반영은 기존 Xcode Cloud와 경로에 따라 GitHub Pages 배포를 실행할 수 있다. 필요 없는 main push로 배포를 반복하지 않는다.
8. Linux에는 Xcode·Swift가 없다. 서버에서 TS 빌드·테스트를 실행하고 Apple 검증은 원격 Verify/Mac에서 확인한다. iPhone 테스트 타깃은 현재 없다.
9. `.local/`은 도구·캐시·검증 증거 전용 Git 제외 경로다. API 키·인증서·사용자 노트·Vault 내용은 커밋하지 않는다. 기존 SSH 설정은 로컬 `.git/config`에서만 지정한다.
