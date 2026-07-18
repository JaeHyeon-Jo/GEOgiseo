import { describe, it, expect } from 'vitest';
import { NoteIndex } from '../src/index-store.js';
import { parseNote } from '../src/note.js';
import type { LocationNote } from '../src/note.js';
import type { LatLng } from '../src/geo.js';

function noteAt(path: string, lat: number, lng: number): LocationNote {
  return parseNote(`---\nlocation: [${lat}, ${lng}]\n---\n${path}`, path);
}

const seoulCityHall: LatLng = { lat: 37.5665, lng: 126.978 };

describe('NoteIndex', () => {
  it('path 없는 노트는 add 시 오류', () => {
    const idx = new NoteIndex();
    expect(() => idx.add(parseNote('---\nlocation: [1,2]\n---\nx'))).toThrow();
  });

  it('add/remove/size/get 기본 동작', () => {
    const idx = new NoteIndex();
    idx.add(noteAt('a.md', 37.57, 126.98));
    expect(idx.size).toBe(1);
    expect(idx.get('a.md')?.path).toBe('a.md');
    idx.remove('a.md');
    expect(idx.size).toBe(0);
  });

  it('near는 반경 내 노트를 거리 오름차순으로 반환', () => {
    const idx = new NoteIndex();
    idx.addAll([
      noteAt('gyeongbok.md', 37.5796, 126.977), // 시청에서 ~1.5km
      noteAt('namsan.md', 37.5512, 126.9882), // 시청에서 ~1.9km
      noteAt('busan.md', 35.1151, 129.0413), // 매우 멀다
    ]);

    const results = idx.near(seoulCityHall, 3000);
    expect(results.map((r) => r.note.path)).toEqual(['gyeongbok.md', 'namsan.md']);
    expect(results[0]!.distanceMeters).toBeLessThan(results[1]!.distanceMeters);
  });

  it('반경 밖 노트는 제외', () => {
    const idx = new NoteIndex();
    idx.add(noteAt('busan.md', 35.1151, 129.0413));
    expect(idx.near(seoulCityHall, 3000)).toHaveLength(0);
  });

  it('다중 마커 노트는 가장 가까운 마커로 한 번만 대표된다', () => {
    const multi = parseNote(
      `---\nlocations:\n---\n[가까움](geo:37.5666,126.9781) [멂](geo:35.1,129.0)`,
      'multi.md',
    );
    const idx = new NoteIndex();
    idx.add(multi);
    const results = idx.near(seoulCityHall, 3000);
    expect(results).toHaveLength(1);
    expect(results[0]!.point.lat).toBeCloseTo(37.5666, 4);
  });
});
