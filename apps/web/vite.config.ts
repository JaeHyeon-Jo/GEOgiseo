import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// gray-matter(@geogiseo/core 내부)는 전역 Buffer를 참조한다.
// 플러그인 대신 main.tsx에서 `buffer` 패키지로 Buffer 전역을 주입하고,
// 여기서는 일부 구현이 참조하는 `global`만 브라우저에 매핑한다.
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer'],
  },
});
