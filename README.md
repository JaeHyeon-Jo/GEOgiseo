# GEOgiseo

위치에 묶인 노트를 마크다운으로 저장하는 로컬 우선 앱. iPhone·Apple Watch·웹과 로컬 Vault용 MCP 서버를 포함한다.

## 개발 환경

- 서버 작업 폴더: `/home/isidol11/projects/geogiseo-ios`
- GitHub: https://github.com/JaeHyeon-Jo/GEOgiseo
- 작업 전 [AI_CONTEXT.md](AI_CONTEXT.md)·[AGENTS.md](AGENTS.md)를 읽고 작업 후 현재 상태를 갱신한다. 변경 경위는 [CHANGELOG.md](CHANGELOG.md).
- 서버·Mac 작업과 배포: [원격 개발 안내](docs/REMOTE_DEVELOPMENT.md). 설계 배경: [docs/DESIGN.md](docs/DESIGN.md).

Node 22 이상·pnpm 10.33.0을 사용한다. 서버에 pnpm이 없으면 프로젝트 내부에만 도구·캐시를 두는 도우미로 실행한다.

```sh
bash scripts/pnpm.sh install --frozen-lockfile --store-dir .local/pnpm-store
bash scripts/pnpm.sh -r build
bash scripts/pnpm.sh -r typecheck
bash scripts/pnpm.sh -r test
```

pnpm이 설치된 Mac/CI에서는 일반 `pnpm` 명령을 사용한다. 코어의 빌드 결과를 웹·MCP가 사용하므로 빌드 후 타입 검사·테스트를 실행한다.

## 구조

| 위치 | 역할 |
|---|---|
| [packages/core](packages/core) | 노트 파싱·좌표·근접 인덱스 |
| [packages/mcp-server](packages/mcp-server) | 로컬 마크다운 Vault용 MCP 서버 |
| [GEOgiseoApps/web](GEOgiseoApps/web) | React·Capacitor 웹/iPhone UI |
| [GEOgiseoApps/web/ios/App](GEOgiseoApps/web/ios/App) | Git으로 관리하는 iPhone·Watch·컴플리케이션 소스 |

## 원격 검증과 배포

Linux에서 편집·커밋·push하고 PR을 연다. `Verify`는 전체 TS 빌드·타입 검사·테스트 통과 후 Xcode 27에서 iPhone 앱(Watch 포함)을 빌드하고 Watch 단위 테스트를 실행한다. Actions에서 수동 실행할 수도 있다. Linux에는 Xcode·Swift가 없어 Apple 검증은 원격 CI/Mac에서 한다.

main 반영은 기존 Xcode Cloud를 통한 iOS 배포 경로다. 실제 TestFlight 그룹·시작 조건은 App Store Connect에서 관리하며 최신 확인 범위는 `AI_CONTEXT.md`에 기록한다. 웹 관련 main 변경은 기존 GitHub Pages 배포도 실행한다: https://jaehyeon-jo.github.io/GEOgiseo/

웹→iOS 반영은 `pnpm --filter @geogiseo/core build` 후 `pnpm --filter @geogiseo/web ios:sync`. 이 명령에는 복사 후 커스텀 Swift 플러그인 등록 복원이 포함된다. iOS 프로젝트를 새로 생성하지 않는다.
