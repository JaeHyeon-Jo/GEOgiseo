import { registerPlugin } from '@capacitor/core';

/** 애플워치에서 큐로 들어온 음성 메모 한 건. */
export interface WatchNote {
  id: string;
  text: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  /** 워치에서 기록 당시 얻은 동네 이름(있으면). */
  place?: string;
  /** epoch milliseconds */
  ts?: number;
}

/** 워치로 보내는 즐겨찾기 장소. 워치는 이걸로 메모를 장소별로 묶는다. */
export interface WatchPlace {
  id: string;
  name: string;
  emoji?: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export interface PluginListenerHandle {
  remove(): Promise<void>;
}

export interface WatchBridgePlugin {
  /** 아직 저장 안 된 워치 메모 목록. 저장 후 ackPending으로 지운다. */
  getPending(): Promise<{ notes: WatchNote[] }>;
  /** 저장 완료한 메모 id들을 큐에서 제거. */
  ackPending(options: { ids: string[] }): Promise<void>;
  /** 즐겨찾기 장소 목록을 워치에 최신 상태로 전달 (워치 앱이 꺼져 있어도 다음 실행 때 반영). */
  syncPlaces(options: { places: WatchPlace[] }): Promise<void>;
  /** 앱이 떠 있는 동안 새 메모 도착 시 발생. */
  addListener(eventName: 'watchNote', listener: () => void): Promise<PluginListenerHandle>;
}

// 웹(개발 환경)에서는 no-op — iOS에서만 네이티브 구현이 활성화됨
export const WatchBridge = registerPlugin<WatchBridgePlugin>('WatchBridge', {
  web: () => ({
    getPending: () => Promise.resolve({ notes: [] }),
    ackPending: () => Promise.resolve(),
    syncPlaces: () => Promise.resolve(),
    addListener: () => Promise.resolve({ remove: () => Promise.resolve() }),
  }),
});
