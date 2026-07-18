/**
 * Vault — 마크다운 폴더에 대한 파일시스템 계층.
 *
 * 진실 공급원은 폴더 안의 `.md` 파일이다. 이 계층은 파일을 읽어 @geogiseo/core로
 * 파싱하고, 근접 쿼리용 인덱스를 재생성하며, 노트를 직렬화해 다시 쓴다.
 * 모든 경로는 vault 루트 기준 상대 경로이며, 루트를 벗어나는 접근은 차단한다.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  NoteIndex,
  parseNote,
  serializeNote,
  type LocationNote,
} from '@geogiseo/core';

async function walkMarkdown(dir: string, base: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out; // 폴더가 아직 없으면 빈 목록
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue; // 숨김 파일/폴더 제외 (예: .obsidian)
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walkMarkdown(full, base)));
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      out.push(path.relative(base, full));
    }
  }
  return out;
}

/** vault 루트 기준 안전한 파일명 슬러그. 한글 등 유니코드 문자는 보존. */
export function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60);
  return s.length > 0 ? s : 'note';
}

export class Vault {
  constructor(private readonly dir: string) {}

  get root(): string {
    return path.resolve(this.dir);
  }

  /** vault 안의 모든 `.md` 상대 경로. */
  async listPaths(): Promise<string[]> {
    return walkMarkdown(this.root, this.root);
  }

  async exists(relPath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(relPath));
      return true;
    } catch {
      return false;
    }
  }

  /** 파일 원문(마크다운)을 그대로 반환. */
  async readRaw(relPath: string): Promise<string> {
    return fs.readFile(this.resolve(relPath), 'utf8');
  }

  async read(relPath: string): Promise<LocationNote> {
    return parseNote(await this.readRaw(relPath), relPath);
  }

  async readAll(): Promise<LocationNote[]> {
    const paths = await this.listPaths();
    return Promise.all(paths.map((p) => this.read(p)));
  }

  /** 좌표가 있는 노트만 담은 근접 인덱스를 재생성한다. */
  async buildIndex(): Promise<NoteIndex> {
    const idx = new NoteIndex();
    for (const note of await this.readAll()) {
      if (note.location || note.locations.length > 0) idx.add(note);
    }
    return idx;
  }

  /** 노트를 직렬화해 note.path 위치에 쓴다. 하위 폴더는 자동 생성. */
  async write(note: LocationNote): Promise<string> {
    if (!note.path) throw new Error('Vault.write: note.path is required');
    const abs = this.resolve(note.path);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, serializeNote(note), 'utf8');
    return note.path;
  }

  /** 이미 존재하면 `-1`, `-2` … 접미사를 붙여 충돌 없는 상대 경로를 만든다. */
  async uniquePath(relPath: string): Promise<string> {
    const ext = path.extname(relPath);
    const stem = ext ? relPath.slice(0, -ext.length) : relPath;
    let candidate = relPath;
    let n = 1;
    while (await this.exists(candidate)) {
      candidate = `${stem}-${n}${ext}`;
      n += 1;
    }
    return candidate;
  }

  /** 상대 경로를 절대 경로로 해석하되 vault 루트를 벗어나면 오류. */
  private resolve(relPath: string): string {
    const abs = path.resolve(this.root, relPath);
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) {
      throw new Error(`path escapes vault: ${relPath}`);
    }
    return abs;
  }
}
