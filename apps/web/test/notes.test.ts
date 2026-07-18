import { describe, it, expect } from 'vitest';
import { parseNote } from '@geogiseo/core';
import { slugify, noteFilename, uniquePath, locationLabel } from '../src/notes.js';

describe('slugify', () => {
  it('한글 보존, 공백/기호는 하이픈', () => {
    expect(slugify('남산 벚꽃!')).toBe('남산-벚꽃');
  });
  it('빈 결과는 note로 대체', () => {
    expect(slugify('###')).toBe('note');
  });
});

describe('noteFilename', () => {
  it('날짜-슬러그.md 형태', () => {
    expect(noteFilename('경복궁 나들이', '2026-04-05T11:00:00+09:00')).toBe(
      '2026-04-05-경복궁-나들이.md',
    );
  });
});

describe('uniquePath', () => {
  it('충돌 없으면 그대로', () => {
    expect(uniquePath('a.md', new Set())).toBe('a.md');
  });
  it('충돌 시 접미사', () => {
    expect(uniquePath('a.md', new Set(['a.md', 'a-1.md']))).toBe('a-2.md');
  });
});

describe('locationLabel', () => {
  it('단일 위치는 소수 4자리', () => {
    const n = parseNote('---\nlocation: [37.5512, 126.9882]\n---\nx', 'a.md');
    expect(locationLabel(n)).toBe('37.5512, 126.9882');
  });
  it('위치 없으면 안내 문구', () => {
    const n = parseNote('---\ntitle: x\n---\ny', 'a.md');
    expect(locationLabel(n)).toBe('위치 없음');
  });
});
