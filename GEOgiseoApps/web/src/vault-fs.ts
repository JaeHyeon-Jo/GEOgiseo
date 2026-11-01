/**
 * File System Access API 기반 vault 래퍼 (브라우저).
 * 사용자가 고른 로컬 폴더의 `.md` 파일을 @geogiseo/core로 파싱/직렬화한다.
 * 폴더가 옵시디언 vault를 가리키면 여기서 만든 노트가 옵시디언에도 그대로 보인다.
 */
import { parseNote, serializeNote, type LocationNote } from '@geogiseo/core';
import { PLACES_FILE } from './places.js';

type DirHandle = FileSystemDirectoryHandle & FileSystemDirectoryHandleEntries;

/** 브라우저가 File System Access API를 지원하는지. */
export function isFsAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** 폴더 선택 대화상자를 띄워 읽기/쓰기 핸들을 얻는다. (사용자 제스처 필요) */
export async function pickVault(): Promise<DirHandle> {
  if (!window.showDirectoryPicker) throw new Error('File System Access API 미지원');
  return window.showDirectoryPicker({ mode: 'readwrite' });
}

export async function readPlaces(dir: DirHandle): Promise<string | null> {
  let handle: FileSystemFileHandle;
  try { handle = await dir.getFileHandle(PLACES_FILE); }
  catch (e) {
    if ((e as Error).name === 'NotFoundError') return null;
    throw e;
  }
  const file = await handle.getFile();
  if (file.size > 1024 * 1024) throw new Error('즐겨찾기 파일은 1MB를 넘을 수 없습니다.');
  return file.text();
}

export async function writePlaces(dir: DirHandle, content: string): Promise<void> {
  if (new Blob([content]).size > 1024 * 1024) throw new Error('즐겨찾기 파일은 1MB를 넘을 수 없습니다.');
  const handle = await dir.getFileHandle(PLACES_FILE, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(content);
    await writable.close();
  } catch (e) {
    await writable.abort().catch(() => {});
    throw e;
  }
}

async function* walk(
  dir: DirHandle,
  prefix = '',
): AsyncGenerator<[string, FileSystemFileHandle]> {
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith('.')) continue; // .obsidian 등 숨김 항목 제외
    const rel = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      yield* walk(handle as DirHandle, rel);
    } else if (name.toLowerCase().endsWith('.md')) {
      yield [rel, handle as FileSystemFileHandle];
    }
  }
}

/**
 * vault 안의 모든 위치 노트를 읽어 파싱한다.
 * frontmatter가 깨진 파일(옵시디언의 비-GEOgiseo 노트 등)은 건너뛰고 나머지를 반환한다.
 */
export async function readAllNotes(dir: DirHandle): Promise<LocationNote[]> {
  const notes: LocationNote[] = [];
  for await (const [rel, fh] of walk(dir)) {
    const file = await fh.getFile();
    try {
      notes.push(parseNote(await file.text(), rel));
    } catch (e) {
      console.warn(`노트 파싱 실패, 건너뜀: ${rel}`, e);
    }
  }
  return notes;
}

/** 노트 파일을 삭제한다. */
export async function deleteNote(dir: DirHandle, path: string): Promise<void> {
  const parts = path.split('/');
  const fileName = parts.pop() as string;
  let d = dir;
  for (const p of parts) {
    try { d = (await d.getDirectoryHandle(p)) as DirHandle; }
    catch { return; }
  }
  try { await d.removeEntry(fileName); }
  catch { /* 이미 없거나 접근 불가 */ }
}

/** 노트를 직렬화해 note.path 위치에 쓴다. 하위 폴더는 자동 생성. */
export async function writeNote(dir: DirHandle, note: LocationNote): Promise<void> {
  if (!note.path) throw new Error('writeNote: note.path is required');
  const parts = note.path.split('/');
  const fileName = parts.pop() as string;
  let d = dir;
  for (const p of parts) {
    d = (await d.getDirectoryHandle(p, { create: true })) as DirHandle;
  }
  const fh = await d.getFileHandle(fileName, { create: true });
  const writable = await fh.createWritable();
  await writable.write(serializeNote(note));
  await writable.close();
}
