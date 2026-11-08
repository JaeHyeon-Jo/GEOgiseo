import { Capacitor, registerPlugin } from '@capacitor/core';
import { isWeeklyDocument } from './weekly-stars.js';

export interface ReadingDocument { path: string; content: string }
export interface ReadingFolder {
  name: string;
  read(): Promise<{ documents: ReadingDocument[]; skipped: number }>;
  replaceWeekly(path: string, expected: string, content: string): Promise<void>;
}

interface ReaderPlugin {
  pickFolder(): Promise<{ bookmark: string; name: string }>;
  readNotes(options: { bookmark: string }): Promise<{
    notes: ReadingDocument[]; skippedNoteCount?: number; bookmark?: string;
  }>;
  replaceWeekly(options: { bookmark: string; path: string; expected: string; content: string }): Promise<{ bookmark?: string }>;
}
const plugin = registerPlugin<ReaderPlugin>('VaultAccess');
const bookmarkKey = 'geogiseo.reader.bookmark';
const nameKey = 'geogiseo.reader.name';

function nativeReader(initialBookmark: string, name: string): ReadingFolder {
  let bookmark = initialBookmark;
  return { name, async replaceWeekly(path, expected, content) {
    if (!isWeeklyDocument(path)) throw new Error('Weekly 문서만 수정할 수 있어요.');
    const result = await plugin.replaceWeekly({ bookmark, path, expected, content });
    if (result.bookmark) { bookmark = result.bookmark; localStorage.setItem(bookmarkKey, bookmark); }
  }, async read() {
    const result = await plugin.readNotes({ bookmark });
    if (result.bookmark) {
      bookmark = result.bookmark;
      localStorage.setItem(bookmarkKey, bookmark);
    }
    return { documents: result.notes, skipped: result.skippedNoteCount ?? 0 };
  } };
}

export function restoreReadingFolder(): ReadingFolder | null {
  if (!Capacitor.isNativePlatform()) return null;
  const bookmark = localStorage.getItem(bookmarkKey);
  return bookmark ? nativeReader(bookmark, localStorage.getItem(nameKey) ?? '폴더') : null;
}

export async function pickReadingFolder(): Promise<ReadingFolder> {
  if (Capacitor.isNativePlatform()) {
    const { bookmark, name } = await plugin.pickFolder();
    localStorage.setItem(bookmarkKey, bookmark);
    localStorage.setItem(nameKey, name);
    return nativeReader(bookmark, name);
  }
  if (!window.showDirectoryPicker) throw new Error('이 브라우저에서는 폴더 선택을 지원하지 않습니다.');
  const root = await window.showDirectoryPicker({ mode: 'read' });
  return { name: root.name, async replaceWeekly(path, expected, content) {
    if (!isWeeklyDocument(path)) throw new Error('Weekly 문서만 수정할 수 있어요.');
    const parts = path.split('/');
    if (parts.some(part => !part || part === '.' || part === '..')) throw new Error('잘못된 문서 경로입니다.');
    if (await root.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('폴더 쓰기 권한이 필요해요.');
    let directory = root;
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part) as typeof root;
    const handle = await directory.getFileHandle(parts[parts.length - 1]!);
    const writable = await handle.createWritable();
    try {
      const file = await handle.getFile();
      if (file.size > 5 * 1024 * 1024 || await file.text() !== expected) throw new Error('파일이 다른 곳에서 변경되었어요. 목록에서 새로고침 후 다시 시도해 주세요.');
      await writable.write(content);
      await writable.close();
    } catch (error) { await writable.abort().catch(() => {}); throw error; }
  }, async read() {
    const documents: ReadingDocument[] = [];
    let skipped = 0;
    async function walk(dir: FileSystemDirectoryHandle & FileSystemDirectoryHandleEntries, prefix = ''): Promise<void> {
      for await (const [name, handle] of dir.entries()) {
        if (name.startsWith('.')) continue;
        const path = prefix ? `${prefix}/${name}` : name;
        if (handle.kind === 'directory') await walk(handle as FileSystemDirectoryHandle & FileSystemDirectoryHandleEntries, path);
        else if (name.toLowerCase().endsWith('.md')) {
          try {
            const file = await (handle as FileSystemFileHandle).getFile();
            if (file.size > 5 * 1024 * 1024) { skipped++; continue; }
            documents.push({ path, content: await file.text() });
          } catch { skipped++; }
        }
      }
    }
    await walk(root);
    return { documents, skipped };
  } };
}
