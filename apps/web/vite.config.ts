import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// gray-matter(@geogiseo/core 내부)는 전역 Buffer를 참조한다.
// 플러그인 대신 main.tsx에서 `buffer` 패키지로 Buffer 전역을 주입하고,
// 여기서는 일부 구현이 참조하는 `global`만 브라우저에 매핑한다.
export default defineConfig({
  // GitHub Pages 프로젝트 사이트는 /GEOgiseo/ 하위 경로에서 서빙된다.
  // CI에서 VITE_BASE=/GEOgiseo/ 로 주입하고, 로컬 개발/빌드는 루트('/')를 쓴다.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer'],
  },
});
