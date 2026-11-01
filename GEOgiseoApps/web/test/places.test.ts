import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cachePlaces, loadPlaces, parsePlaces, persistPlaces, restorePlaces, serializePlaces,
  type FavoritePlace, type PlacesFile,
} from '../src/places.js';

const home: FavoritePlace = {
  id: 'home', name: '집', emoji: '🏠', lat: 37.5, lng: 127, radiusM: 200, tag: 'home',
};
const work: FavoritePlace = { ...home, id: 'work', name: '회사', tag: 'work' };

function memoryFile(content: string | null = null) {
  let saved = content;
  return {
    readPlaces: vi.fn(async () => saved),
    writePlaces: vi.fn(async (next: string) => { saved = next; }),
  } satisfies PlacesFile;
}

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    clear: () => values.clear(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('즐겨찾기 보관함 저장', () => {
  it('기존 앱 즐겨찾기를 파일이 없는 보관함으로 이관한다', async () => {
    cachePlaces([home]);
    const file = memoryFile();
    expect(await restorePlaces(file, loadPlaces())).toEqual([home]);
    expect(parsePlaces((await file.readPlaces())!)).toEqual([home]);
  });

  it('앱 저장소를 지운 뒤 같은 폴더에서 복원한다', async () => {
    const file = memoryFile();
    await persistPlaces(file, [home, work]);
    localStorage.clear();
    expect(loadPlaces()).toEqual([]);
    const restored = await restorePlaces(file, loadPlaces());
    cachePlaces(restored);
    expect(loadPlaces()).toEqual([home, work]);
    expect(file.writePlaces).toHaveBeenCalledTimes(1);
  });

  it('다른 폴더의 기존 파일은 앱 캐시보다 우선하고 덮어쓰지 않는다', async () => {
    const file = memoryFile(serializePlaces([work]));
    expect(await restorePlaces(file, [home])).toEqual([work]);
    expect(file.writePlaces).not.toHaveBeenCalled();
  });

  it('수정과 마지막 장소 삭제까지 파일에 반영하고 빈 목록을 복원한다', async () => {
    const file = memoryFile();
    await persistPlaces(file, [home]);
    await persistPlaces(file, [{ ...home, name: '우리 집', radiusM: 500 }]);
    expect(await restorePlaces(file, [])).toEqual([{ ...home, name: '우리 집', radiusM: 500 }]);
    await persistPlaces(file, []);
    expect(await restorePlaces(file, [home])).toEqual([]);
    expect(loadPlaces()).toEqual([]);
  });

  it.each(['{broken', '{"version":2,"places":[]}', '{"version":1,"places":[{}]}'])(
    '손상되거나 미지원인 파일은 덮어쓰지 않는다: %s', async (content) => {
      const file = memoryFile(content);
      await expect(restorePlaces(file, [home])).rejects.toThrow();
      expect(file.writePlaces).not.toHaveBeenCalled();
      expect(await file.readPlaces()).toBe(content);
    },
  );

  it('읽기 권한/다운로드 실패는 파일 없음으로 간주하지 않는다', async () => {
    const file = memoryFile();
    file.readPlaces.mockRejectedValue(new Error('권한 없음'));
    await expect(restorePlaces(file, [home])).rejects.toThrow('권한 없음');
    expect(file.writePlaces).not.toHaveBeenCalled();
  });

  it('폴더 쓰기 실패 시 기존 앱 캐시를 유지한다', async () => {
    cachePlaces([home]);
    const file = memoryFile(serializePlaces([home]));
    file.writePlaces.mockRejectedValue(new Error('디스크 쓰기 실패'));
    await expect(persistPlaces(file, [work])).rejects.toThrow('디스크 쓰기 실패');
    expect(loadPlaces()).toEqual([home]);
    expect(await restorePlaces(file, [])).toEqual([home]);
  });

  it('연결한 폴더가 없으면 기존처럼 앱 내부에 저장한다', async () => {
    await persistPlaces(null, [home]);
    expect(loadPlaces()).toEqual([home]);
  });

  it.each([
    { lat: 91 }, { lng: -181 }, { radiusM: 0 }, { radiusM: Infinity }, { name: ' ' }, { id: '' },
  ])('잘못된 장소 데이터를 저장하지 않는다: %j', async (change) => {
    const file = memoryFile();
    await expect(persistPlaces(file, [{ ...home, ...change }])).rejects.toThrow();
    expect(file.writePlaces).not.toHaveBeenCalled();
  });

  it('같은 ID가 중복된 파일을 거부한다', () => {
    expect(() => parsePlaces(JSON.stringify({ version: 1, places: [home, home] }))).toThrow();
  });
});
