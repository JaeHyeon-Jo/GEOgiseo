/** 노트 관련 순수 헬퍼 (파일명 생성 등). @geogiseo/core를 보완하는 앱 로컬 유틸. */
import type { LocationNote } from '@geogiseo/core';

/** 한글 등 유니코드 문자를 보존하는 파일명 슬러그. */
export function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60);
  return s.length > 0 ? s : 'note';
}

/** 제목과 시각으로 `YYYY-MM-DD-슬러그.md` 상대 경로를 만든다. */
export function noteFilename(title: string, capturedAt: string): string {
  const date = capturedAt.slice(0, 10);
  return `${date}-${slugify(title)}.md`;
}

/** 이미 존재하는 경로들과 충돌하지 않도록 접미사를 붙인다. */
export function uniquePath(desired: string, existing: Set<string>): string {
  if (!existing.has(desired)) return desired;
  const dot = desired.lastIndexOf('.');
  const stem = dot >= 0 ? desired.slice(0, dot) : desired;
  const ext = dot >= 0 ? desired.slice(dot) : '';
  let n = 1;
  let candidate = `${stem}-${n}${ext}`;
  while (existing.has(candidate)) {
    n += 1;
    candidate = `${stem}-${n}${ext}`;
  }
  return candidate;
}

/** 노트의 대표 좌표 요약 문자열. */
export function locationLabel(note: LocationNote): string {
  if (note.location) {
    return `${note.location.lat.toFixed(4)}, ${note.location.lng.toFixed(4)}`;
  }
  if (note.locations.length > 0) return `마커 ${note.locations.length}개`;
  return '위치 없음';
}
