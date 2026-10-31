/**
 * vault 추상화 — 웹/네이티브 공통 인터페이스.
 *
 * - 데스크톱 웹: File System Access API(`vault-fs.ts`)로 사용자가 고른 로컬 폴더에 저장.
 * - iOS 네이티브: 커스텀 플러그인 `VaultAccess`로 문서 피커에서 고른 폴더
 *   (예: iCloud Drive의 옵시디언 vault)에 보안 스코프 북마크로 접근해 저장.
 *
 * 호출부(App)는 어느 플랫폼인지 몰라도 `Vault`만 쓰면 된다.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { parseNote, serializeNote, type LocationNote } from '@geogiseo/core';
import {
  isFsAccessSupported,
  pickVault as pickWebVault,
  readAllNotes as readWebNotes,
  writeNote as writeWebNote,
  deleteNote as deleteWebNote,
} from './vault-fs.js';

export interface Vault {
  name: string;
  readAll(): Promise<LocationNote[]>;
  write(note: LocationNote): Promise<void>;
  delete(path: string): Promise<void>;
}

// --- 네이티브(iOS) 플러그인 브릿지 ---
interface VaultAccessPlugin {
  pickFolder(): Promise<{ bookmark: string; name: string }>;
  readNotes(options: { bookmark: string }): Promise<{
    notes: { path: string; content: string }[];
    bookmark?: string;
  }>;
  writeNote(options: { bookmark: string; path: string; content: string }): Promise<{ bookmark?: string }>;
  deleteNote(options: { bookmark: string; path: string }): Promise<{ bookmark?: string }>;
}

const VaultAccess = registerPlugin<VaultAccessPlugin>('VaultAccess');

const BOOKMARK_KEY = 'geogiseo.vault.bookmark';
const NAME_KEY = 'geogiseo.vault.name';

/** 네이티브 백엔드. 북마크가 갱신되면 localStorage에 다시 저장한다. */
function nativeVault(initialBookmark: string, name: string): Vault {
  let bookmark = initialBookmark;
  const remember = (refreshed?: string) => {
    if (refreshed) {
      bookmark = refreshed;
      localStorage.setItem(BOOKMARK_KEY, bookmark);
    }
  };
  return {
    name,
    async readAll() {
      const res = await VaultAccess.readNotes({ bookmark });
      remember(res.bookmark);
      // frontmatter가 깨진 파일(비-GEOgiseo 노트 등)은 건너뛰고 나머지를 반환한다.
      return res.notes.flatMap((n) => {
        try {
          return [parseNote(n.content, n.path)];
        } catch (e) {
          console.warn(`노트 파싱 실패, 건너뜀: ${n.path}`, e);
          return [];
        }
      });
    },
    async write(note) {
      if (!note.path) throw new Error('note.path is required');
      const res = await VaultAccess.writeNote({
        bookmark,
        path: note.path,
        content: serializeNote(note),
      });
      remember(res.bookmark);
    },
    async delete(path) {
      const res = await VaultAccess.deleteNote({ bookmark, path });
      remember(res.bookmark);
    },
  };
}

/** 웹(File System Access API) 백엔드. */
function webVault(dir: Awaited<ReturnType<typeof pickWebVault>>, name: string): Vault {
  return {
    name,
    readAll: () => readWebNotes(dir),
    write: (note) => writeWebNote(dir, note),
    delete: (path) => deleteWebNote(dir, path),
  };
}

/** 현재 플랫폼에서 폴더 저장(vault)을 지원하는지. */
export function isVaultSupported(): boolean {
  return Capacitor.isNativePlatform() || isFsAccessSupported();
}

/** 폴더 선택 대화상자를 띄워 vault 핸들을 얻는다. (사용자 제스처 필요) */
export async function pickVault(): Promise<Vault> {
  if (Capacitor.isNativePlatform()) {
    const { bookmark, name } = await VaultAccess.pickFolder();
    localStorage.setItem(BOOKMARK_KEY, bookmark);
    localStorage.setItem(NAME_KEY, name);
    return nativeVault(bookmark, name);
  }
  const dir = await pickWebVault();
  return webVault(dir, dir.name);
}

/**
 * 앱 재실행 시 저장해 둔 폴더를 자동 복원한다(네이티브 전용).
 * 웹은 File System Access 핸들을 영속화할 수 없어 항상 null.
 */
export function restoreVault(): Vault | null {
  if (!Capacitor.isNativePlatform()) return null;
  const bookmark = localStorage.getItem(BOOKMARK_KEY);
  if (!bookmark) return null;
  return nativeVault(bookmark, localStorage.getItem(NAME_KEY) ?? '폴더');
}
