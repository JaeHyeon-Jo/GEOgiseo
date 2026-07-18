/**
 * 위치 노트 모델과 마크다운 양방향 변환.
 *
 * 진실 공급원은 `.md` 파일이다. 여기서는 옵시디언 Map View 규약과 호환되도록
 * frontmatter를 파싱/직렬화한다:
 *   - 단일 위치:  location: [lat, lng]   (또는 레거시 문자열 "lat, lng")
 *   - 다중 마커:  빈 `locations:` 플래그 + 본문 인라인 [이름](geo:lat,lng)
 *
 * YAML 파싱은 js-yaml JSON_SCHEMA로 고정해 타임스탬프가 Date 객체로 자동
 * 변환되지 않게 한다(문자열 그대로 유지 → 라운드트립 안정성).
 */
import matter from 'gray-matter';
import yaml from 'js-yaml';
import type { LatLng } from './geo.js';

/** 이름이 있는 위치(다중 마커의 각 지점). */
export interface NamedLocation extends LatLng {
  name: string;
}

/** 파싱된 위치 노트. */
export interface LocationNote {
  /** vault 루트 기준 상대 경로. 저장 전에는 비어 있을 수 있음. */
  path?: string;
  title?: string;
  /** 기본 단일 위치 (frontmatter `location`). */
  location?: LatLng;
  /** 본문 인라인 `geo:` 링크에서 파싱한 다중 마커. */
  locations: NamedLocation[];
  /** 촬영/기록 시각 (ISO 문자열, 원문 유지). */
  capturedAt?: string;
  place?: string;
  /** GPS 정확도(m). */
  accuracy?: number;
  tags: string[];
  /** 위 타입 필드에 매핑되지 않은 frontmatter 키. 원문 그대로 보존. */
  extraFrontmatter: Record<string, unknown>;
  body: string;
}

const yamlEngine = {
  parse: (s: string): object =>
    (yaml.load(s, { schema: yaml.JSON_SCHEMA }) as object) ?? {},
  stringify: (o: object): string =>
    // flowLevel: 1 → 최상위 매핑은 블록, 그 값(배열 등)은 인라인 플로우 스타일로.
    // 결과: `location: [37.5512, 126.9882]` (Obsidian Properties 호환 형식)
    yaml.dump(o, {
      schema: yaml.JSON_SCHEMA,
      lineWidth: -1,
      sortKeys: false,
      flowLevel: 1,
    }),
};

const matterOptions = { engines: { yaml: yamlEngine } };

/** `[이름](geo:lat,lng)` 인라인 링크 매칭. */
const GEO_LINK_RE = /\[([^\]]*)\]\(geo:(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/g;

const stripHash = (s: string): string => s.trim().replace(/^#/, '');

function coerceString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** frontmatter의 location 값을 LatLng로 해석. 배열형/문자열형 모두 지원. */
export function parseLocationValue(v: unknown): LatLng | undefined {
  if (Array.isArray(v) && v.length >= 2) {
    const lat = Number(v[0]);
    const lng = Number(v[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return undefined;
  }
  if (typeof v === 'string') {
    const parts = v.split(',').map((s) => Number(s.trim()));
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      return { lat: parts[0] as number, lng: parts[1] as number };
    }
  }
  return undefined;
}

/** 본문에서 인라인 `geo:` 링크를 모두 추출. */
export function parseInlineGeoLinks(body: string): NamedLocation[] {
  const out: NamedLocation[] = [];
  for (const m of body.matchAll(GEO_LINK_RE)) {
    const lat = Number(m[2]);
    const lng = Number(m[3]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      out.push({ name: m[1] ?? '', lat, lng });
    }
  }
  return out;
}

/** tags 값을 문자열 배열로 정규화. 배열/쉼표·공백 구분 문자열 모두 지원, 선행 `#` 제거. */
export function normalizeTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((t) => stripHash(String(t))).filter(Boolean);
  if (typeof v === 'string') return v.split(/[,\s]+/).map(stripHash).filter(Boolean);
  return [];
}

/** 마크다운 원문을 LocationNote로 파싱. */
export function parseNote(raw: string, path?: string): LocationNote {
  const parsed = matter(raw, matterOptions);
  const fm: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) };
  const body = parsed.content;

  const location = parseLocationValue(fm.location);
  delete fm.location;

  // `locations` 키가 존재하면(빈 값 포함) 본문의 인라인 geo 링크를 파싱한다.
  // 라운드트립을 위해 `locations` 플래그 자체는 extraFrontmatter에 남겨 둔다.
  const locations = 'locations' in fm ? parseInlineGeoLinks(body) : [];

  const tags = normalizeTags(fm.tags);
  delete fm.tags;

  const title = coerceString(fm.title);
  delete fm.title;

  const capturedAt = coerceString(fm.captured_at);
  delete fm.captured_at;

  const place = coerceString(fm.place);
  delete fm.place;

  const accuracy = typeof fm.accuracy === 'number' ? fm.accuracy : undefined;
  delete fm.accuracy;

  return {
    ...(path !== undefined ? { path } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(location !== undefined ? { location } : {}),
    locations,
    ...(capturedAt !== undefined ? { capturedAt } : {}),
    ...(place !== undefined ? { place } : {}),
    ...(accuracy !== undefined ? { accuracy } : {}),
    tags,
    extraFrontmatter: fm,
    body,
  };
}

/**
 * LocationNote를 마크다운 문자열로 직렬화.
 * 타입 필드를 먼저 쓰고, 이어서 보존된 extraFrontmatter를 덧붙인다.
 * 본문은 그대로 유지되므로 다중 마커의 인라인 링크도 보존된다.
 */
export function serializeNote(note: LocationNote): string {
  const data: Record<string, unknown> = {};
  if (note.title !== undefined) data.title = note.title;
  if (note.location) data.location = [note.location.lat, note.location.lng];
  if (note.capturedAt !== undefined) data.captured_at = note.capturedAt;
  if (note.place !== undefined) data.place = note.place;
  if (note.accuracy !== undefined) data.accuracy = note.accuracy;
  if (note.tags.length > 0) data.tags = note.tags;
  Object.assign(data, note.extraFrontmatter);

  return matter.stringify(note.body, data, matterOptions);
}
