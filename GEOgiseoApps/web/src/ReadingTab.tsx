import { useEffect, useRef, useState } from 'react';
import { pickReadingFolder, restoreReadingFolder, type ReadingDocument, type ReadingFolder } from './reading-folder.js';
import { ReadingContent } from './ReadingContent.js';
import { isReaderBackSwipe, startReaderSwipe, type SwipeStart } from './reader-swipe.js';

export function ReadingTab() {
  const [folder, setFolder] = useState<ReadingFolder | null>(restoreReadingFolder);
  const [documents, setDocuments] = useState<ReadingDocument[]>([]);
  const [selected, setSelected] = useState<ReadingDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [skipped, setSkipped] = useState(0);
  const request = useRef(0);
  const swipe = useRef<SwipeStart | null>(null);

  async function load(next: ReadingFolder) {
    const id = ++request.current;
    setBusy(true); setError('');
    try {
      const result = await next.read();
      if (id !== request.current) return;
      setDocuments(result.documents.sort((a, b) => b.path.localeCompare(a.path, 'ko', { numeric: true })));
      setSkipped(result.skipped);
    } catch (e) {
      if (id !== request.current) return;
      setDocuments([]); setError(`문서를 불러오지 못했어요. 폴더를 다시 선택하거나 새로고침해 주세요. ${(e as Error).message}`);
    } finally { if (id === request.current) setBusy(false); }
  }
  useEffect(() => { if (folder) void load(folder); return () => { request.current++; }; }, [folder]);

  async function choose() {
    try {
      const next = await pickReadingFolder();
      setSelected(null); setDocuments([]); setSkipped(0); setFolder(next);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(`폴더를 선택하지 못했어요. ${(e as Error).message}`);
    }
  }

  return <div className="tab-pane"
    onTouchStart={e => { swipe.current = selected ? startReaderSwipe(e.touches) : null; }}
    onTouchMove={e => { if (e.touches.length !== 1) swipe.current = null; }}
    onTouchCancel={() => { swipe.current = null; }}
    onTouchEnd={e => {
      const start = swipe.current;
      swipe.current = null;
      if (!selected || !start || e.touches.length !== 0) return;
      const touch = Array.from(e.changedTouches).find(item => item.identifier === start.id);
      if (touch && isReaderBackSwipe(start, touch)) setSelected(null);
    }}>
    <div className="tab-header">
      {selected ? <button className="vault-btn" onClick={() => setSelected(null)}>‹ 목록</button> : <strong>문서</strong>}
      {!selected && <button className="vault-btn" onClick={() => void choose()} disabled={busy}>{folder ? '폴더 변경' : '폴더 선택'}</button>}
    </div>
    {selected ? <div className="reader-scroll">
      <h2>{selected.path.split('/').pop()?.replace(/\.md$/i, '')}</h2>
      <p className="muted small">{selected.path}</p>
      <ReadingContent content={selected.content} />
    </div> : <div className="reader-scroll">
      {!folder && <p className="muted">읽고 싶은 문서가 있는 폴더를 선택해 주세요. 메모 저장 폴더와 별도로 설정됩니다.</p>}
      {folder && <div className="reader-folder"><span>📁 {folder.name} · 하위 폴더 포함</span><button className="vault-btn" onClick={() => void load(folder)} disabled={busy}>새로고침</button></div>}
      {busy && <p className="muted">문서를 불러오는 중…</p>}
      {error && <p role="alert">{error}</p>}
      {skipped > 0 && <p role="status">읽지 못한 문서 {skipped}개가 있어요. 파일 상태를 확인해 주세요.</p>}
      {folder && !busy && !error && documents.length === 0 && <p className="muted">이 폴더에 읽을 수 있는 Markdown 문서가 없어요.</p>}
      {!busy && documents.map(doc => <button className="reader-item" key={doc.path} onClick={() => setSelected(doc)}>
        <strong>{doc.path.split('/').pop()?.replace(/\.md$/i, '')}</strong>
        <span>{doc.path.includes('/') ? doc.path.slice(0, doc.path.lastIndexOf('/')) : folder?.name}</span>
      </button>)}
    </div>}
  </div>;
}
