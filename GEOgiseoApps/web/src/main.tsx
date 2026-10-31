import { Buffer } from 'buffer';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './styles.css';

// gray-matter가 참조하는 전역 Buffer를 파싱보다 먼저 주입한다.
(globalThis as unknown as { Buffer?: typeof Buffer }).Buffer ??= Buffer;

// iPhone 웹뷰에서는 시스템 키보드 위의 이전/다음/완료 액세서리 바를 숨긴다.
if (Capacitor.getPlatform() === 'ios') {
  void Keyboard.setAccessoryBarVisible({ isVisible: false }).catch((error: unknown) => {
    console.warn('키보드 액세서리 바 설정 실패', error);
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
