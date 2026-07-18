import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor는 apps/web의 빌드 결과(dist)를 네이티브 앱으로 감싼다.
// iOS 네이티브 프로젝트는 맥에서 `npx cap add ios`로 생성한다(README 참고).
const config: CapacitorConfig = {
  appId: 'app.geogiseo',
  appName: 'GEOgiseo',
  webDir: 'dist',
};

export default config;
