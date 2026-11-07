import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ReadingContent({ content }: { content: string }) {
  const body = content.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  return <div className="reader-content"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{body}</ReactMarkdown></div>;
}
