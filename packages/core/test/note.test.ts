import { describe, it, expect } from 'vitest';
import { parseNote, serializeNote, normalizeTags } from '../src/note.js';

const singleArrayForm = `---
title: 남산 산책
location: [37.5512, 126.9882]
captured_at: 2026-07-17T09:14:00+09:00
place: 남산공원
accuracy: 8
tags: [geogiseo, 산책]
---
남산 산책 중. 벚꽃이 아직 남아있다.

![[attachments/2026-07-17-남산-01.jpg]]
`;

describe('parseNote — 단일 위치 (배열형)', () => {
  const note = parseNote(singleArrayForm, 'notes/남산.md');

  it('location을 [lat, lng]로 파싱', () => {
    expect(note.location).toEqual({ lat: 37.5512, lng: 126.9882 });
  });

  it('타입 필드를 추출', () => {
    expect(note.title).toBe('남산 산책');
    expect(note.place).toBe('남산공원');
    expect(note.accuracy).toBe(8);
    expect(note.path).toBe('notes/남산.md');
  });

  it('captured_at을 Date가 아닌 문자열로 보존', () => {
    expect(note.capturedAt).toBe('2026-07-17T09:14:00+09:00');
  });

  it('tags를 정규화', () => {
    expect(note.tags).toEqual(['geogiseo', '산책']);
  });

  it('본문(사진 임베드 포함)을 유지', () => {
    expect(note.body).toContain('![[attachments/2026-07-17-남산-01.jpg]]');
  });
});

describe('parseNote — 레거시 문자열형 location', () => {
  it('"lat, lng" 문자열도 파싱', () => {
    const note = parseNote('---\nlocation: "37.5665, 126.9780"\n---\n본문');
    expect(note.location).toEqual({ lat: 37.5665, lng: 126.978 });
  });
});

describe('parseNote — 다중 마커 (인라인 geo 링크)', () => {
  const multi = `---
locations:
---
1지점: [한강](geo:37.5172,126.9966)
2지점: [여의도](geo:37.5219, 126.9245)
`;
  const note = parseNote(multi);

  it('locations 플래그가 있으면 본문 인라인 링크를 파싱', () => {
    expect(note.locations).toEqual([
      { name: '한강', lat: 37.5172, lng: 126.9966 },
      { name: '여의도', lat: 37.5219, lng: 126.9245 },
    ]);
  });

  it('locations 플래그가 없으면 인라인 링크를 스캔하지 않는다', () => {
    const noFlag = parseNote('---\ntitle: x\n---\n[한강](geo:37.5,126.9)');
    expect(noFlag.locations).toEqual([]);
  });
});

describe('parseNote — 알 수 없는 frontmatter 보존', () => {
  it('전용 키가 아닌 값은 extraFrontmatter에 남는다', () => {
    const note = parseNote('---\nlocation: [1, 2]\ncustom_key: 값\n---\n본문');
    expect(note.extraFrontmatter.custom_key).toBe('값');
  });
});

describe('serializeNote — 라운드트립', () => {
  it('parse → serialize → parse 가 의미적으로 동일', () => {
    const once = parseNote(singleArrayForm, 'notes/남산.md');
    const round = parseNote(serializeNote(once), 'notes/남산.md');
    expect(round.location).toEqual(once.location);
    expect(round.title).toBe(once.title);
    expect(round.place).toBe(once.place);
    expect(round.accuracy).toBe(once.accuracy);
    expect(round.capturedAt).toBe(once.capturedAt);
    expect(round.tags).toEqual(once.tags);
    expect(round.body.trim()).toBe(once.body.trim());
  });

  it('직렬화는 멱등하다 (두 번째부터 텍스트 안정)', () => {
    const first = serializeNote(parseNote(singleArrayForm));
    const second = serializeNote(parseNote(first));
    expect(second).toBe(first);
  });

  it('직렬화 결과의 location은 [lat, lng] 배열형', () => {
    const out = serializeNote(parseNote(singleArrayForm));
    expect(out).toContain('location:');
    expect(parseNote(out).location).toEqual({ lat: 37.5512, lng: 126.9882 });
  });
});

describe('normalizeTags', () => {
  it('배열 입력', () => {
    expect(normalizeTags(['a', '#b'])).toEqual(['a', 'b']);
  });
  it('쉼표/공백 문자열 입력', () => {
    expect(normalizeTags('a, #b c')).toEqual(['a', 'b', 'c']);
  });
  it('그 외 입력은 빈 배열', () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags(42)).toEqual([]);
  });
});
