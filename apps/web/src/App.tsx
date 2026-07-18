import { useMemo, useState } from 'react';
import {
  NoteIndex,
  normalizeTags,
  type LatLng,
  type LocationNote,
} from '@geogiseo/core';
import { MapView } from './MapView.js';
import { locationLabel, noteFilename, uniquePath } from './notes.js';
import { sampleNotes } from './sample.js';
import {
  isFsAccessSupported,
  pickVault,
  readAllNotes,
  writeNote,
} from './vault-fs.js';

type DirHandle = FileSystemDirectoryHandle & FileSystemDirectoryHandleEntries;
type Source = { kind: 'none' } | { kind: 'sample' } | { kind: 'folder'; dir: DirHandle; name: string };

interface Draft {
  base: LocationNote | null; // 편집 중 원본(추가 frontmatter 보존용)
  title: string;
  lat: string;
  lng: string;
  place: string;
  tags: string;
  body: string;
}

const SEOUL: LatLng = { lat: 37.5665, lng: 126.978 };

function emptyDraft(at: LatLng): Draft {
  return { base: null, title: '', lat: String(at.lat), lng: String(at.lng), place: '', tags: '', body: '' };
}

function draftFromNote(n: LocationNote): Draft {
  const loc = n.location ?? n.locations[0] ?? SEOUL;
  return {
    base: n,
    title: n.title ?? '',
    lat: String(loc.lat),
    lng: String(loc.lng),
    place: n.place ?? '',
    tags: n.tags.join(', '),
    body: n.body,
  };
}

export default function App() {
  const [source, setSource] = useState<Source>({ kind: 'none' });
  const [notes, setNotes] = useState<LocationNote[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [queryPoint, setQueryPoint] = useState<LatLng | null>(null);
  const [radiusMeters, setRadiusMeters] = useState(3000);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const existingPaths = useMemo(
    () => new Set(notes.map((n) => n.path).filter((p): p is string => !!p)),
    [notes],
  );

  const nearby = useMemo(() => {
    if (!queryPoint) return null;
    const idx = new NoteIndex();
    for (const n of notes) if (n.location || n.locations.length) idx.add(n);
    return idx.near(queryPoint, radiusMeters);
  }, [queryPoint, radiusMeters, notes]);

  async function openFolder() {
    setError(null);
    try {
      const dir = await pickVault();
      const loaded = await readAllNotes(dir);
      setSource({ kind: 'folder', dir, name: dir.name });
      setNotes(loaded);
      setSelectedPath(null);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // 사용자가 취소
      setError((e as Error).message);
    }
  }

  function loadSample() {
    setSource({ kind: 'sample' });
    setNotes(sampleNotes());
    setSelectedPath(null);
    setError(null);
  }

  async function refresh() {
    if (source.kind !== 'folder') return;
    setNotes(await readAllNotes(source.dir));
  }

  function selectNote(path: string) {
    setSelectedPath(path);
    const n = notes.find((x) => x.path === path);
    if (n) setDraft(draftFromNote(n));
  }

  function onMapClick(p: LatLng) {
    setQueryPoint(p);
    // 새 노트 작성 중이면 좌표를 채운다.
    setDraft((d) => (d && d.base === null ? { ...d, lat: String(p.lat), lng: String(p.lng) } : d));
  }

  function newNote() {
    setSelectedPath(null);
    setDraft(emptyDraft(queryPoint ?? SEOUL));
  }

  async function saveDraft() {
    if (!draft) return;
    setError(null);
    const lat = Number(draft.lat);
    const lng = Number(draft.lng);
    if (!draft.title.trim()) return setError('제목을 입력하세요.');
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return setError('좌표가 올바르지 않습니다.');

    const base = draft.base;
    const capturedAt = base?.capturedAt ?? new Date().toISOString();
    const path = base?.path ?? uniquePath(noteFilename(draft.title, capturedAt), existingPaths);

    const note: LocationNote = {
      path,
      title: draft.title.trim(),
      location: { lat, lng },
      locations: base?.locations ?? [],
      capturedAt,
      ...(draft.place.trim() ? { place: draft.place.trim() } : {}),
      tags: normalizeTags(draft.tags),
      extraFrontmatter: base?.extraFrontmatter ?? {},
      body: draft.body,
    };

    try {
      if (source.kind === 'folder') {
        await writeNote(source.dir, note);
        await refresh();
      } else {
        // 샘플/메모리 모드: 상태에서 교체 또는 추가
        setNotes((prev) => {
          const i = prev.findIndex((n) => n.path === path);
          if (i >= 0) {
            const copy = prev.slice();
            copy[i] = note;
            return copy;
          }
          return [...prev, note];
        });
        if (source.kind === 'none') setSource({ kind: 'sample' });
      }
      setSelectedPath(path);
      setDraft(draftFromNote(note));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const listNotes = nearby ? nearby.map((r) => r.note) : notes;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">GEOgiseo</div>
        <div className="actions">
          {isFsAccessSupported() ? (
            <button onClick={openFolder}>📂 폴더 열기</button>
          ) : (
            <span className="hint">이 브라우저는 폴더 열기를 지원하지 않습니다 (Chrome 권장)</span>
          )}
          <button onClick={loadSample}>✨ 샘플 불러오기</button>
          {source.kind === 'folder' && <button onClick={refresh}>↻ 새로고침</button>}
          <button onClick={newNote}>＋ 새 노트</button>
        </div>
        <div className="status">
          {source.kind === 'folder' && <>📁 {source.name} · </>}
          {source.kind === 'sample' && <>✨ 샘플 · </>}
          노트 {notes.length}개
        </div>
      </header>

      {error && <div className="error">⚠ {error}</div>}

      <div className="body">
        <aside className="sidebar">
          <div className="sidebar-head">
            {queryPoint ? (
              <>
                <div className="row">
                  <strong>근처 노트</strong>
                  <button className="link" onClick={() => setQueryPoint(null)}>
                    전체 보기
                  </button>
                </div>
                <label className="radius">
                  반경 {(radiusMeters / 1000).toFixed(1)}km
                  <input
                    type="range"
                    min={500}
                    max={20000}
                    step={500}
                    value={radiusMeters}
                    onChange={(e) => setRadiusMeters(Number(e.target.value))}
                  />
                </label>
              </>
            ) : (
              <div className="row">
                <strong>모든 노트</strong>
                <span className="muted">지도를 클릭해 근처 검색</span>
              </div>
            )}
          </div>

          <ul className="note-list">
            {listNotes.length === 0 && <li className="muted empty">노트가 없습니다.</li>}
            {listNotes.map((n) => {
              const dist = nearby?.find((r) => r.note.path === n.path)?.distanceMeters;
              return (
                <li
                  key={n.path}
                  className={n.path === selectedPath ? 'selected' : ''}
                  onClick={() => selectNote(n.path as string)}
                >
                  <div className="note-title">{n.title ?? n.path}</div>
                  <div className="note-meta">
                    {locationLabel(n)}
                    {dist !== undefined && <> · {Math.round(dist)}m</>}
                  </div>
                  {n.tags.length > 0 && (
                    <div className="tags">
                      {n.tags.map((t) => (
                        <span key={t} className="tag">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>

        <main className="map-wrap">
          <MapView
            notes={notes}
            selectedPath={selectedPath}
            queryPoint={queryPoint}
            radiusMeters={radiusMeters}
            onSelectNote={selectNote}
            onMapClick={onMapClick}
          />
        </main>

        {draft && (
          <aside className="editor">
            <div className="row">
              <strong>{draft.base ? '노트 편집' : '새 노트'}</strong>
              <button className="link" onClick={() => setDraft(null)}>
                닫기
              </button>
            </div>
            <label>
              제목
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="예: 남산 벚꽃"
              />
            </label>
            <div className="coords">
              <label>
                위도
                <input value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: e.target.value })} />
              </label>
              <label>
                경도
                <input value={draft.lng} onChange={(e) => setDraft({ ...draft, lng: e.target.value })} />
              </label>
            </div>
            <p className="muted small">💡 지도를 클릭하면 위 좌표가 채워집니다.</p>
            <label>
              장소
              <input
                value={draft.place}
                onChange={(e) => setDraft({ ...draft, place: e.target.value })}
                placeholder="예: 남산공원"
              />
            </label>
            <label>
              태그 (쉼표로 구분)
              <input
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                placeholder="산책, 봄"
              />
            </label>
            <label>
              본문
              <textarea
                rows={6}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </label>
            <button className="primary" onClick={saveDraft}>
              {source.kind === 'folder' ? '💾 폴더에 저장' : '저장 (메모리)'}
            </button>
            {source.kind !== 'folder' && (
              <p className="muted small">폴더를 열지 않아 파일로 저장되지 않습니다.</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
