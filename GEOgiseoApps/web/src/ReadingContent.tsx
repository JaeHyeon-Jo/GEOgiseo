import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { splitFrontmatter } from './weekly-stars.js';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export function ReadingContent({ content, weekly = false, saving = false, onStar }: { content: string; weekly?: boolean; saving?: boolean; onStar?: (line: number) => void }) {
  const { body } = splitFrontmatter(content);
  const lines = body.split(/\r?\n/);
  const modern = lines.some(line => /^ {0,3}###\s+/.test(line));
  function heading(level: 2 | 3, children: ReactNode, line?: number) {
    const raw = line ? lines[line - 1] : undefined;
    const eligible = weekly && !!onStar && !!raw && new RegExp(`^ {0,3}#{${level}}[ \\t]+\\S`).test(raw) && (modern ? level === 3 : level === 2)
      && !/^ {0,3}##\s+⭐\s*이번 주 표현한 관심사/.test(raw);
    if (!eligible || !line) return children;
    const starred = /(?:[ \t]*⭐\uFE0F?)+[ \t]*$/.test(raw);
    const clean = Array.isArray(children) ? [...children] : [children];
    const last = clean.length - 1;
    if (typeof clean[last] === 'string') clean[last] = clean[last].replace(/(?:[ \t]*⭐\uFE0F?)+[ \t]*$/, '');
    return <span className="reader-heading"><span>{clean}</span><button type="button" className="reader-star" disabled={saving} aria-label={starred ? '별표 해제' : '별표 추가'} aria-pressed={starred} onClick={() => onStar(line)}>{starred ? '⭐' : '☆'}</button></span>;
  }
  return <div className="reader-content"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
    h2: ({ node, children, ...props }: ComponentPropsWithoutRef<'h2'> & { node?: { position?: { start: { line: number } } } }) => <h2 {...props}>{heading(2, children, node?.position?.start.line)}</h2>,
    h3: ({ node, children, ...props }: ComponentPropsWithoutRef<'h3'> & { node?: { position?: { start: { line: number } } } }) => <h3 {...props}>{heading(3, children, node?.position?.start.line)}</h3>,
  }}>{body}</ReactMarkdown></div>;
}
