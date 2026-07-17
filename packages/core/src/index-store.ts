/**
 * 메모리 내 파생 위치 인덱스.
 *
 * 진실 공급원은 마크다운 파일이며, 이 인덱스는 조회 속도를 위한 재생성 가능한
 * 파생물이다. 근접 쿼리는 bounding-box 1차 필터 + haversine 정밀 계산으로 처리한다.
 * (규모가 커지면 동일 인터페이스를 SQLite R-tree 인덱스로 승격 — DESIGN.md §6 참고)
 */
import {
  boundingBoxAround,
  haversineMeters,
  withinBoundingBox,
  type LatLng,
} from './geo.js';
import type { LocationNote } from './note.js';

/** 근접 쿼리 결과 한 건. */
export interface NearResult {
  note: LocationNote;
  /** 노트에서 중심에 가장 가까운 지점. */
  point: LatLng;
  distanceMeters: number;
}

/** path를 키로 하는 위치 노트 인덱스. */
export class NoteIndex {
  private readonly notes = new Map<string, LocationNote>();

  /** 노트를 추가/갱신한다. path가 필요하다. */
  add(note: LocationNote): void {
    if (!note.path) throw new Error('NoteIndex.add: note.path is required');
    this.notes.set(note.path, note);
  }

  /** 여러 노트를 한 번에 추가/갱신한다. */
  addAll(notes: Iterable<LocationNote>): void {
    for (const n of notes) this.add(n);
  }

  remove(path: string): void {
    this.notes.delete(path);
  }

  get(path: string): LocationNote | undefined {
    return this.notes.get(path);
  }

  get size(): number {
    return this.notes.size;
  }

  all(): LocationNote[] {
    return [...this.notes.values()];
  }

  /** 한 노트에 속한 모든 좌표(단일 location + 다중 locations). */
  private *pointsOf(note: LocationNote): Generator<LatLng> {
    if (note.location) yield note.location;
    for (const l of note.locations) yield { lat: l.lat, lng: l.lng };
  }

  /**
   * 중심에서 반경(m) 안의 노트를, 가장 가까운 지점 기준 거리 오름차순으로 반환한다.
   * 다중 마커 노트는 가장 가까운 마커 하나로 대표된다(중복 없음).
   */
  near(center: LatLng, radiusMeters: number): NearResult[] {
    const bbox = boundingBoxAround(center, radiusMeters);
    const results: NearResult[] = [];

    for (const note of this.notes.values()) {
      let best: NearResult | undefined;
      for (const p of this.pointsOf(note)) {
        if (!withinBoundingBox(p, bbox)) continue;
        const d = haversineMeters(center, p);
        if (d <= radiusMeters && (best === undefined || d < best.distanceMeters)) {
          best = { note, point: p, distanceMeters: d };
        }
      }
      if (best !== undefined) results.push(best);
    }

    results.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return results;
  }
}
