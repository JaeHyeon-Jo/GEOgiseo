# 원격 개발·검증·배포

## Linux 서버

작업 폴더는 `/home/isidol11/projects/geogiseo-ios`다. 먼저 `AI_CONTEXT.md`와 작업 트리를 확인한다. 아래 브랜치 전환은 미완료 변경이 없을 때 실행한다.

```sh
cd /home/isidol11/projects/geogiseo-ios
git status --short --branch
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feature/change-name
bash scripts/pnpm.sh install --frozen-lockfile --store-dir .local/pnpm-store
bash scripts/pnpm.sh -r build
bash scripts/pnpm.sh -r typecheck
bash scripts/pnpm.sh -r test
```

이 체크아웃의 `.git/config`에만 기존 사용자 SSH 설정을 지정했다. 다른 장비에서는 해당 장비의 GitHub 인증을 사용한다.

코어 빌드 후 `bash scripts/pnpm.sh --filter @geogiseo/web dev --host 127.0.0.1`로 웹을 실행한다. 접속 PC에서 `ssh -N -L 5173:127.0.0.1:5173 <기존 SSH 접속 대상>`을 실행하고 `http://localhost:5173`으로 접속한다. 네이티브 지도·Watch 기능은 iPhone/Watch에서 확인한다.

## PR 검증

변경 파일을 선택해 커밋·push하고 main 대상 PR을 열면 Actions의 `Verify`가 실행된다. main에 워크플로가 반영된 뒤 Actions → Verify → Run workflow에서 브랜치를 선택할 수도 있다.

1. Ubuntu: 잠금 파일 설치 → 전체 TS 빌드 → 타입 검사 → 전체 테스트.
2. Xcode 27: 잠금 파일 설치 → 코어 빌드 → `ios:sync` → `pod install --deployment`.
3. 최신 설치 iPhone 시뮬레이터로 `GEOgiseo` 스킴을 빌드한다. 임베드된 Watch 앱·컴플리케이션도 포함한다.
4. Watch 시뮬레이터로 기존 단위 테스트 4개를 실행한다. UI 테스트는 제외하며 결과 `.xcresult`를 7일 보관한다.

Apple 명령은 `App.xcworkspace`를 사용한다. PR 검증에는 배포 인증서나 App Store Connect 키가 필요 없다. iPhone 테스트 타깃은 아직 없어 iPhone은 빌드만 확인한다.

## Mac에서 실행

Xcode 27, iOS·watchOS 시뮬레이터, Node 22 이상, pnpm 10.33.0, CocoaPods를 준비한다. 기존 체크아웃을 업데이트하고 실행한다.

```sh
pnpm install --frozen-lockfile
pnpm --filter @geogiseo/core build
pnpm --filter @geogiseo/web ios:sync
cd GEOgiseoApps/web/ios/App
pod install --deployment
open App.xcworkspace
```

`GEOgiseo` 스킴으로 iPhone을 실행하고 `GeoWatch Watch App` 스킴으로 Watch를 실행·테스트한다. 최소 iOS 15.0, watchOS 26.5다. 기존 네이티브 프로젝트가 있으므로 `cap add ios`는 실행하지 않는다. 웹 변경 후 코어 빌드·`ios:sync`를 다시 실행한다. 플러그인 의존성을 바꾸면 Podfile·잠금 파일을 함께 검토한다.

## Xcode Cloud·TestFlight

기존 Cloud product·앱을 유지한다. product ID: `3f59db3d-244a-49b3-96f4-c4ad7545aaab`, App Store Connect 앱 ID: `6829224561`.

- 번들 ID: `app.geogiseo`, Watch `app.geogiseo.watchkitapp`, 컴플리케이션 `app.geogiseo.watchkitapp.GeoWatchComplication`.
- 공유 스킴: `GEOgiseo`, 작업 공간: `GEOgiseoApps/web/ios/App/App.xcworkspace`.
- `ci_post_clone.sh`: 의존성 설치 → 코어 빌드 → iOS 자산·플러그인 등록 복원 → CocoaPods 설치.
- `ci_post_xcodebuild.sh`: Cloud 배포 서명 오류 진단을 빌드 로그에 출력.

main 반영 후 커밋의 `GEOgiseo | GEOgiseo` 상태와 연결된 Cloud 빌드를 확인한다. [App Store Connect](https://appstoreconnect.apple.com/apps/6829224561/ci)에서 시작 조건(main 변경)·Archive 배포 범위·TestFlight 내부 그룹 후속 작업을 확인한다. 저장소 manifest만으로 이 설정을 판정할 수 없다. 빌드 성공·업로드 후 처리·TestFlight 설치 가능 여부를 구분해 기록한다.

웹 배포는 기존 `.github/workflows/deploy.yml` 담당. Pages는 `VITE_BASE=/GEOgiseo/`, iOS는 `/`를 사용한다. 사용자 Vault·API 키·인증서·캐시는 커밋하지 않는다.

공식 참고: [Xcode Cloud 최초 설정](https://developer.apple.com/documentation/xcode/configuring-your-first-xcode-cloud-workflow), [배포 워크플로](https://developer.apple.com/documentation/xcode/creating-a-workflow-that-builds-your-app-for-distribution), [GitHub 실행기](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run).
