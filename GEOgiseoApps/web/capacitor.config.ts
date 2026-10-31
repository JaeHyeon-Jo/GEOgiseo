import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

// Capacitor는 GEOgiseoApps/web의 dist를 기존 네이티브 앱으로 감싼다.
// ios:sync로 복사한 뒤 로컬 Swift 플러그인 등록을 복원한다.
const config: CapacitorConfig = {
  appId: 'app.geogiseo',
  appName: 'GEOgiseo',
  webDir: 'dist',
  plugins: {
    // 기본값 'native'는 키보드 애니메이션 +0.2초 뒤에 WKWebView 프레임을 줄여서
    // 레이아웃이 늦게 따라오고, 줄어든 웹뷰 아래로 검은 배경이 비친다.
    // 웹뷰는 그대로 두고 App.tsx의 visualViewport 추적으로 에디터 높이를 맞춘다.
    Keyboard: {
      resize: KeyboardResize.None,
    },
  },
};

export default config;
