# 맥북 Xcode에서 이어서 하기 (Capacitor iOS)

클라우드 세션에서 진행한 **Phase 3 (Capacitor setup + GPS)** 를 맥으로 가져와
네이티브 iOS 앱으로 실행하기 위한 실행 체크리스트.

> 핵심: `ios/` 네이티브 프로젝트는 저장소에 넣지 않는다(`.gitignore`).
> Xcode·CocoaPods가 있는 **맥에서 직접 생성**한다. 아래 순서대로만 하면 된다.

---

## 0. 현재 상태 (클라우드에서 넘어온 것)

- 브랜치: `claude/xcode-macbook-continuation-u7fa8a` (푸시 완료)
- `apps/web`에 Capacitor 구성 완료: `@capacitor/core`, `@capacitor/ios`,
  `@capacitor/geolocation`, `capacitor.config.ts`
- "📍 현재 위치 사용" 버튼은 웹/네이티브 자동 분기(`src/geolocation.ts`)
- 아직 없는 것: `apps/web/ios/` (맥에서 생성) + Info.plist 위치 권한 문구

---

## 1. 코드 받기

```bash
git clone https://github.com/JaeHyeon-Jo/GEOgiseo.git
cd GEOgiseo
git checkout claude/xcode-macbook-continuation-u7fa8a
```

이미 클론돼 있으면:

```bash
git fetch origin
git checkout claude/xcode-macbook-continuation-u7fa8a
git pull origin claude/xcode-macbook-continuation-u7fa8a
```

---

## 2. 사전 준비물 (없으면 설치)

- [ ] **Xcode** — App Store 설치 후 한 번 실행해 라이선스 동의
- [ ] **CocoaPods** — `sudo gem install cocoapods` 또는 `brew install cocoapods`
- [ ] **pnpm** — `npm i -g pnpm`
      (이 repo는 pnpm 워크스페이스라 `npm install` 대신 pnpm 사용)
- [ ] **Node 20+** (권장 22)

---

## 3. 의존성 설치 & 웹 빌드

```bash
pnpm install
pnpm --filter @geogiseo/web build   # dist/ 생성 — Capacitor가 이 결과물을 감싼다
```

---

## 4. iOS 프로젝트 생성 (최초 1회)

```bash
cd apps/web
npx cap add ios      # ios/ 네이티브 프로젝트 생성
npx cap sync ios     # 웹 자산 + geolocation 플러그인 동기화
```

---

## 5. 위치 권한 설명 추가 (필수)

`apps/web/ios/App/App/Info.plist` 에 아래 키를 추가한다.
**없으면 GPS 요청 시 앱이 크래시한다.**

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>현재 위치를 노트에 기록합니다</string>
```

---

## 6. Xcode로 열어 실행

```bash
npx cap open ios     # Xcode 실행
```

Xcode에서:

1. 상단 타깃에서 시뮬레이터 또는 연결한 실기기 선택
2. **실기기로 돌릴 때**: `App` 타깃 → Signing & Capabilities →
   Team에 본인 Apple ID 선택(무료 계정 가능)
3. ▶︎ Run

---

## 반복 작업 (웹 코드 수정 후)

웹 코드를 바꿀 때마다 아래를 다시 돌려야 앱에 반영된다.

```bash
pnpm --filter @geogiseo/web build && npx cap sync ios
```

---

## 주의사항

- **`ios/` 폴더는 커밋하지 않는다.** 이미 `.gitignore`에 잡혀 있다.
- **GPS는 실기기에서 검증한다.** 시뮬레이터는 좌표가 가짜라
  "📍 현재 위치 사용" 버튼 실제 동작 확인이 안 된다.
- Android가 필요하면 맥 없이도 `npx cap add android` 로 동일하게 진행.

---

## 참고

- 웹앱/Capacitor 상세: [../apps/web/README.md](../apps/web/README.md)
- 설계 배경: [./DESIGN.md](./DESIGN.md)
