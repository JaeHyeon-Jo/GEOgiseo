import { registerPlugin } from '@capacitor/core';

export interface NativeMapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  emoji?: string;
  isPlace: boolean;
  radiusM?: number;
  /** 장소 반경 안 노트 개수 (isPlace 마커에만). */
  noteCount?: number;
  /** 핀 콜아웃 본문 미리보기 (노트 마커). */
  preview?: string;
  /** 핀 콜아웃 하단 시간·장소. */
  meta?: string;
}

export interface EmbedFrame { x: number; y: number; width: number; height: number; }

export interface PluginListenerHandle {
  remove(): Promise<void>;
}

export interface NativeMapPlugin {
  show(options: { lat: number; lng: number; markers?: NativeMapMarker[] }): Promise<void>;
  hide(): Promise<void>;
  showPicker(options: { lat: number; lng: number; radiusM: number; showRadius?: boolean }): Promise<void>;
  startHeading(): Promise<void>;
  stopHeading(): Promise<void>;
  /** 지도 탭 — 웹뷰 위 지정 영역에 지도를 띄운다(처음 한 번만 lat/lng로 센터링). */
  embed(options: EmbedFrame & { lat: number; lng: number }): Promise<void>;
  setEmbedMarkers(options: { markers: NativeMapMarker[] }): Promise<void>;
  hideEmbed(): Promise<void>;
  addListener(eventName: 'markerTapped', listener: (data: { id: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'locationPicked', listener: (data: { lat: number; lng: number; radiusM?: number }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'heading', listener: (data: { heading: number }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'closed', listener: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'pickerCancelled', listener: () => void): Promise<PluginListenerHandle>;
}

// 웹(개발 환경)에서는 no-op — iOS에서만 네이티브 구현이 활성화됨
export const NativeMap = registerPlugin<NativeMapPlugin>('NativeMap', {
  web: () => ({
    show: () => Promise.resolve(),
    hide: () => Promise.resolve(),
    showPicker: () => Promise.resolve(),
    startHeading: () => Promise.resolve(),
    stopHeading: () => Promise.resolve(),
    embed: () => Promise.resolve(),
    setEmbedMarkers: () => Promise.resolve(),
    hideEmbed: () => Promise.resolve(),
    addListener: (_: string, __: unknown) => Promise.resolve({ remove: () => Promise.resolve() }),
  }),
});
