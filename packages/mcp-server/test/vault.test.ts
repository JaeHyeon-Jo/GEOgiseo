import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Vault, slugify } from '../src/vault.js';
import type { LocationNote } from '@geogiseo/core';

let dir: string;
let vault: Vault;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'geogiseo-vault-'));
  vault = new Vault(dir);
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function note(p: string, lat: number, lng: number, title = p): LocationNote {
  return {
    path: p,
    title,
    location: { lat, lng },
    locations: [],
    tags: [],
    extraFrontmatter: {},
    body: '본문',
  };
}

describe('Vault 파일 왕복', () => {
  it('write 후 read로 좌표를 복원', async () => {
    await vault.write(note('notes/남산.md', 37.5512, 126.9882));
    const back = await vault.read('notes/남산.md');
    expect(back.location).toEqual({ lat: 37.5512, lng: 126.9882 });
    expect(back.title).toBe('notes/남산.md');
  });

  it('listPaths / readAll 은 하위 폴더의 .md를 모두 찾는다', async () => {
    await vault.write(note('a.md', 1, 1));
    await vault.write(note('sub/b.md', 2, 2));
    const paths = (await vault.listPaths()).sort();
    expect(paths).toEqual(['a.md', 'sub/b.md']);
    expect(await vault.readAll()).toHaveLength(2);
  });

  it('숨김 폴더(.obsidian 등)는 무시', async () => {
    await fs.mkdir(path.join(dir, '.obsidian'), { recursive: true });
    await fs.writeFile(path.join(dir, '.obsidian', 'x.md'), '---\n---\n');
    await vault.write(note('visible.md', 1, 1));
    expect(await vault.listPaths()).toEqual(['visible.md']);
  });
});

describe('buildIndex + near', () => {
  it('반경 안 노트를 가까운 순으로', async () => {
    await vault.write(note('gyeongbok.md', 37.5796, 126.977));
    await vault.write(note('busan.md', 35.1151, 129.0413));
    const idx = await vault.buildIndex();
    const near = idx.near({ lat: 37.5665, lng: 126.978 }, 3000);
    expect(near.map((r) => r.note.path)).toEqual(['gyeongbok.md']);
  });
});

describe('uniquePath', () => {
  it('충돌 시 접미사를 붙인다', async () => {
    expect(await vault.uniquePath('a.md')).toBe('a.md');
    await vault.write(note('a.md', 1, 1));
    expect(await vault.uniquePath('a.md')).toBe('a-1.md');
  });
});

describe('경로 이탈 방지', () => {
  it('vault 밖 경로는 오류', async () => {
    await expect(vault.read('../secret.md')).rejects.toThrow(/escapes vault/);
  });
});

describe('slugify', () => {
  it('한글 보존, 공백/기호는 하이픈', () => {
    expect(slugify('남산 산책!')).toBe('남산-산책');
  });
  it('빈 결과는 note로 대체', () => {
    expect(slugify('!!!')).toBe('note');
  });
});
