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

function toFix(pos: { coords: { latitude: number; longitude: number; accuracy?: number } }): Fix {
  return {
    coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
    ...(typeof pos.coords.accuracy === 'number'
      ? { accuracy: Math.round(pos.coords.accuracy) }
      : {}),
  };
}

/**
 * 정밀 위치. 건물 안에서는 GPS 확보가 오래 걸리므로 `maximumAge`로 최근(30초) 위치를
 * 즉시 재사용해 대기를 줄인다.
 */
export async function getCurrentFix(): Promise<Fix> {
  return toFix(await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 10_000,
    maximumAge: 30_000,
  }));
}

/**
 * 빠른 대략 위치 — Wi-Fi/셀 기반이라 건물 안에서도 즉시 나온다.
 * 신규 노트 작성 등 "지금 당장" 위치가 필요할 때 1차로 쓰고, 뒤이어 getCurrentFix로 정밀화한다.
 */
export async function getQuickFix(): Promise<Fix> {
  return toFix(await Geolocation.getCurrentPosition({
    enableHighAccuracy: false,
    timeout: 5_000,
    maximumAge: 120_000,
  }));
}
