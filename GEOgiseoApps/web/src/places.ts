/** 즐겨찾기는 연결한 보관함을 원본으로, 앱 내부 저장소를 오프라인 캐시로 쓴다. */
export interface FavoritePlace {
  id: string;
  name: string;
  emoji?: string;
  lat: number;
  lng: number;
  radiusM: number;
  tag: string;
}

export const PLACES_FILE = 'geogiseo-places.json';
const PLACES_KEY = 'geogiseo-places';

export interface PlacesFile {
  readPlaces(): Promise<string | null>;
  writePlaces(content: string): Promise<void>;
}

function isPlace(value: unknown): value is FavoritePlace {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === 'string' && p.id.length > 0
    && typeof p.name === 'string' && p.name.trim().length > 0
    && (p.emoji === undefined || typeof p.emoji === 'string')
    && typeof p.lat === 'number' && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90
    && typeof p.lng === 'number' && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180
    && typeof p.radiusM === 'number' && Number.isFinite(p.radiusM) && p.radiusM > 0
    && typeof p.tag === 'string';
}

function validatePlaces(value: unknown): FavoritePlace[] {
  if (!Array.isArray(value) || !value.every(isPlace)
    || new Set(value.map((p) => p.id)).size !== value.length) {
    throw new Error('즐겨찾기 파일의 장소 정보가 올바르지 않습니다.');
  }
  return value;
}

export function parsePlaces(content: string): FavoritePlace[] {
  const data: unknown = JSON.parse(content);
  if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1
    || !('places' in data)) {
    throw new Error('지원하지 않는 즐겨찾기 파일 형식입니다.');
  }
  return validatePlaces(data.places);
}

export function serializePlaces(places: FavoritePlace[]): string {
  validatePlaces(places);
  return JSON.stringify({ version: 1, places }, null, 2) + '\n';
}

export function loadPlaces(): FavoritePlace[] {
  try { return validatePlaces(JSON.parse(localStorage.getItem(PLACES_KEY) ?? '[]')); }
  catch { return []; }
}

export function cachePlaces(places: FavoritePlace[]): void {
  localStorage.setItem(PLACES_KEY, JSON.stringify(places));
}

/** 파일이 없을 때만 기존 앱 데이터를 이관한다. 읽기/파싱 실패를 빈 파일로 취급하지 않는다. */
export async function restorePlaces(file: PlacesFile, cached: FavoritePlace[]): Promise<FavoritePlace[]> {
  const content = await file.readPlaces();
  if (content !== null) return parsePlaces(content);
  await file.writePlaces(serializePlaces(cached));
  return cached;
}

export async function persistPlaces(file: PlacesFile | null, places: FavoritePlace[]): Promise<void> {
  const content = serializePlaces(places);
  if (file) await file.writePlaces(content);
  // 파일 저장에 실패하면 캐시/화면도 성공 상태로 바꾸지 않는다.
  cachePlaces(places);
}
