import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { isWeeklyDocument, toggleWeeklyStar } from '../src/weekly-stars.js';
import { ReadingContent } from '../src/ReadingContent.js';

describe('Weekly 별표', () => {
  it('frontmatter와 줄바꿈을 보존하며 지정한 제목만 변경한다', () => {
    const original = '---\r\ntags: [a]\r\n---\r\n## 이번 주\r\n\r\n### 제목 — 11/2\r\n내용\r\n';
    const marked = toggleWeeklyStar(original, 3);
    expect(marked).toBe(original.replace('제목 — 11/2', '제목 — 11/2 ⭐'));
    expect(toggleWeeklyStar(marked, 3)).toBe(original);
    expect(() => toggleWeeklyStar(original, 4)).toThrow();
    expect(isWeeklyDocument('Weekly/2026-W45.md')).toBe(true);
    expect(isWeeklyDocument('Weekly/example.md')).toBe(false);
  });
  it('기존 여러 별표는 사용자가 해제할 때만 제거한다', () => {
    expect(toggleWeeklyStar('## 관심 주제 ⭐⭐\n내용', 1)).toBe('## 관심 주제\n내용');
  });
  it('최신 형식의 주제에만 별 버튼을 표시한다', () => {
    const html = renderToStaticMarkup(<ReadingContent content={'## 이번 주 기록\n\n### 주제 ⭐\n본문'} weekly onStar={() => {}} />);
    expect(html.match(/aria-pressed=/g)).toHaveLength(1);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('별표 해제');
  });
  it('예전 형식의 주제에는 표시하고 관심사 안내 제목에는 표시하지 않는다', () => {
    const html = renderToStaticMarkup(<ReadingContent content={'## 예전 주제\n\n내용\n\n## ⭐ 이번 주 표현한 관심사'} weekly onStar={() => {}} />);
    expect(html.match(/aria-pressed=/g)).toHaveLength(1);
    expect(html).toContain('aria-pressed="false"');
  });
});
