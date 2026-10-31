# @geogiseo/web

React·Capacitor 기반 GEOgiseo UI. 노트를 마크다운으로 저장하고 위치·장소·태그·본문을 편집한다. [AI_CONTEXT.md](../../AI_CONTEXT.md)와 [원격 개발 안내](../../docs/REMOTE_DEVELOPMENT.md)를 따른다.

## 웹 개발

저장소 루트에서 실행한다.

```sh
pnpm install --frozen-lockfile
pnpm --filter @geogiseo/core build
pnpm --filter @geogiseo/web dev --host 127.0.0.1
```

서버에 pnpm이 없으면 `pnpm` 대신 `bash scripts/pnpm.sh`를 사용한다. 브라우저 폴더 접근은 HTTPS 또는 localhost의 Chromium 계열 브라우저에서 지원한다. 현재 지도는 iOS `NativeMapPlugin`을 사용하고 웹 구현은 no-op이므로 웹 미리보기와 iPhone 기능을 구분한다.

## iPhone·Watch

`ios/App`의 네이티브 프로젝트는 Git으로 관리한다. Mac/Cloud에서 준비한다.

```sh
pnpm --filter @geogiseo/core build
pnpm --filter @geogiseo/web ios:sync
cd GEOgiseoApps/web/ios/App
pod install --deployment
open App.xcworkspace
```

`ios:sync`는 웹 빌드 → `cap copy ios` → `patch-ios-plugins.mjs`. 마지막 단계가 `VaultAccessPlugin`, `NativeMapPlugin`, `WatchBridgePlugin` 등록을 보존한다. 네이티브 프로젝트를 다시 만들거나 `cap copy`만 실행하지 않는다. GPS·폴더 권한·Watch 통신은 실제 기기로 확인한다.

## 배포

웹은 main 변경 시 기존 Pages로 배포된다: https://jaehyeon-jo.github.io/GEOgiseo/

Pages의 `VITE_BASE=/GEOgiseo/`와 iOS의 `/`를 구분한다. iOS는 기존 Xcode Cloud를 유지하고 TestFlight 상태는 App Store Connect에서 확인한다. PR의 `Verify`는 TS 검증·iPhone 빌드·Watch 단위 테스트를 담당한다.
