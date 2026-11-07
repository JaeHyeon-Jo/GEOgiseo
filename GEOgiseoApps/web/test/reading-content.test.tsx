import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReadingContent } from '../src/ReadingContent.js';

describe('문서 본문', () => {
  it('frontmatter를 숨기고 마크다운과 체크 목록, 표를 표시한다', () => {
    const html = renderToStaticMarkup(<ReadingContent content={'---\ntags: [test]\n---\n# 제목\n\n**굵게**\n\n- [x] 완료\n\n| 항목 | 값 |\n| --- | --- |\n| A | B |'} />);
    expect(html).not.toContain('tags:');
    expect(html).toContain('<h1>제목</h1>');
    expect(html).toContain('<strong>굵게</strong>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<table>');
  });
  it('문서의 HTML과 위험한 링크를 실행하지 않는다', () => {
    const html = renderToStaticMarkup(<ReadingContent content={'<script>alert(1)</script>\n\n[링크](javascript:alert(1))'} />);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
  });
});
