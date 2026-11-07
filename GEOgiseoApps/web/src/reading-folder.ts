import { Capacitor, registerPlugin } from '@capacitor/core';

export interface ReadingDocument { path: string; content: string }
export interface ReadingFolder {
  name: string;
  read(): Promise<{ documents: ReadingDocument[]; skipped: number }>;
}

interface ReaderPlugin {
  pickFolder(): Promise<{ bookmark: string; name: string }>;
  readNotes(options: { bookmark: string }): Promise<{
    notes: ReadingDocument[]; skippedNoteCount?: number; bookmark?: string;
  }>;
}
const plugin = registerPlugin<ReaderPlugin>('VaultAccess');
const bookmarkKey = 'geogiseo.reader.bookmark';
const nameKey = 'geogiseo.reader.name';

function nativeReader(initialBookmark: string, name: string): ReadingFolder {
  let bookmark = initialBookmark;
  return { name, async read() {
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
  return { name: root.name, async read() {
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
