/**
 * 지리 좌표 유틸리티.
 *
 * 좌표 규약: 이 코어 전역에서 위도(lat), 경도(lng) 순서를 사용한다.
 * GeoJSON / MapLibre는 [lng, lat] 순서이므로, 그 경계에서만 전치(transpose)한다.
 * (toGeoJSONPosition / fromGeoJSONPosition 참고)
 */

/** 위도/경도 좌표 한 쌍. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** 평균 지구 반지름(m). IUGG 평균값. */
export const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * 두 좌표 사이의 대권 거리(m)를 haversine 공식으로 계산한다.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** GeoJSON 좌표 순서 [lng, lat]. */
export type GeoJSONPosition = [number, number];

/** LatLng → GeoJSON [lng, lat]. 지도/GeoJSON 경계에서만 사용. */
export function toGeoJSONPosition(p: LatLng): GeoJSONPosition {
  return [p.lng, p.lat];
}

/** GeoJSON [lng, lat] → LatLng. */
export function fromGeoJSONPosition(pos: GeoJSONPosition): LatLng {
  return { lat: pos[1], lng: pos[0] };
}

/** 위경도 경계 상자. */
export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * 중심점에서 반경(m)을 포함하는 경계 상자를 반환한다.
 * 근접 쿼리의 1차 필터(bounding-box prefilter)로 사용해 haversine 계산을 줄인다.
 * 경도 폭은 위도에 따라 좁아지므로 cos(위도)로 보정한다.
 */
export function boundingBoxAround(center: LatLng, radiusMeters: number): BoundingBox {
  const latDelta = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  const cosLat = Math.max(Math.cos(toRad(center.lat)), 1e-6);
  const lngDelta = latDelta / cosLat;
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

/** 좌표가 경계 상자 안에 있는지 여부. */
export function withinBoundingBox(p: LatLng, b: BoundingBox): boolean {
  return (
    p.lat >= b.minLat &&
    p.lat <= b.maxLat &&
    p.lng >= b.minLng &&
    p.lng <= b.maxLng
  );
}
