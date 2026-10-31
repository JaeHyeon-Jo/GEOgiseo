#!/bin/sh

set -e

cd "${CI_PRIMARY_REPOSITORY_PATH}"

# Xcode Cloud의 깨끗한 체크아웃에서 모노레포 의존성과 iOS 웹 번들을 복원한다.
if ! command -v node >/dev/null 2>&1; then
    brew install node
fi

npx --yes pnpm@10.33.0 install --frozen-lockfile
npx --yes pnpm@10.33.0 --filter @geogiseo/core build
npx --yes pnpm@10.33.0 --filter @geogiseo/web ios:sync

# Capacitor iOS 프로젝트가 참조하는 CocoaPods 워크스페이스를 생성한다.
cd "${CI_PRIMARY_REPOSITORY_PATH}/GEOgiseoApps/web/ios/App"
pod install
