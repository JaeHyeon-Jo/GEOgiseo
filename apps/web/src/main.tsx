import { Buffer } from 'buffer';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './styles.css';

// gray-matter가 참조하는 전역 Buffer를 파싱보다 먼저 주입한다.
(globalThis as unknown as { Buffer?: typeof Buffer }).Buffer ??= Buffer;

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
