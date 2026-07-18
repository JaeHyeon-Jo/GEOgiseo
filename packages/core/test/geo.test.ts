import { describe, it, expect } from 'vitest';
import {
  haversineMeters,
  toGeoJSONPosition,
  fromGeoJSONPosition,
  boundingBoxAround,
  withinBoundingBox,
  type LatLng,
} from '../src/geo.js';

const seoulCityHall: LatLng = { lat: 37.5665, lng: 126.978 };
const busanStation: LatLng = { lat: 35.1151, lng: 129.0413 };

describe('haversineMeters', () => {
  it('두 같은 지점의 거리는 0', () => {
    expect(haversineMeters(seoulCityHall, seoulCityHall)).toBe(0);
  });

  it('서울-부산 거리는 대략 325km (±5km)', () => {
    const d = haversineMeters(seoulCityHall, busanStation);
    expect(d).toBeGreaterThan(320_000);
    expect(d).toBeLessThan(330_000);
  });

  it('대칭이다', () => {
    expect(haversineMeters(seoulCityHall, busanStation)).toBeCloseTo(
      haversineMeters(busanStation, seoulCityHall),
      6,
    );
  });
});

describe('GeoJSON 전치', () => {
  it('LatLng ↔ [lng, lat] 왕복', () => {
    const pos = toGeoJSONPosition(seoulCityHall);
    expect(pos).toEqual([126.978, 37.5665]);
    expect(fromGeoJSONPosition(pos)).toEqual(seoulCityHall);
  });
});

describe('boundingBox', () => {
  it('중심점은 항상 상자 안에 있다', () => {
    const bbox = boundingBoxAround(seoulCityHall, 1000);
    expect(withinBoundingBox(seoulCityHall, bbox)).toBe(true);
  });

  it('반경보다 훨씬 먼 지점은 상자 밖', () => {
    const bbox = boundingBoxAround(seoulCityHall, 1000);
    expect(withinBoundingBox(busanStation, bbox)).toBe(false);
  });

  it('반경이 커질수록 상자가 커진다', () => {
    const small = boundingBoxAround(seoulCityHall, 1000);
    const big = boundingBoxAround(seoulCityHall, 10_000);
    expect(big.maxLat - big.minLat).toBeGreaterThan(small.maxLat - small.minLat);
  });
});
