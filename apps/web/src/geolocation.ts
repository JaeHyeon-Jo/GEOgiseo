/**
 * 현재 위치 획득 — 웹/모바일 공통.
 * @capacitor/geolocation은 브라우저에선 navigator.geolocation을, iOS/Android에선
 * 네이티브 GPS를 자동으로 사용한다. 호출부는 플랫폼을 몰라도 된다.
 */
import { Geolocation } from '@capacitor/geolocation';
import type { LatLng } from '@geogiseo/core';

export interface Fix {
  coords: LatLng;
  /** 수평 정확도(m). 노트의 accuracy로 저장한다. */
  accuracy?: number;
}

export async function getCurrentFix(): Promise<Fix> {
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 10_000,
  });
  return {
    coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
    ...(typeof pos.coords.accuracy === 'number'
      ? { accuracy: Math.round(pos.coords.accuracy) }
      : {}),
  };
}
