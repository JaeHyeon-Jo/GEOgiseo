/**
 * Leaflet 지도. react-leaflet 없이 직접 제어해 버전 결합/이미지 에셋 문제를 피한다.
 * 마커는 circleMarker(이미지 에셋 불필요)로 그린다.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng, LocationNote } from '@geogiseo/core';

export interface MapPoint {
  path: string;
  title: string;
  lat: number;
  lng: number;
}

interface Props {
  notes: LocationNote[];
  selectedPath: string | null;
  queryPoint: LatLng | null;
  radiusMeters: number;
  onSelectNote: (path: string) => void;
  onMapClick: (p: LatLng) => void;
}

const SEOUL: [number, number] = [37.5665, 126.978];

function pointsOf(notes: LocationNote[]): MapPoint[] {
  const pts: MapPoint[] = [];
  for (const n of notes) {
    const title = n.title ?? n.path ?? '(제목 없음)';
    if (n.location) pts.push({ path: n.path ?? '', title, ...n.location });
    for (const l of n.locations) {
      pts.push({ path: n.path ?? '', title: `${title} · ${l.name}`, lat: l.lat, lng: l.lng });
    }
  }
  return pts;
}

export function MapView({
  notes,
  selectedPath,
  queryPoint,
  radiusMeters,
  onSelectNote,
  onMapClick,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const queryLayer = useRef<L.LayerGroup | null>(null);

  // 콜백을 ref에 담아 stale closure를 방지한다.
  const onMapClickRef = useRef(onMapClick);
  const onSelectNoteRef = useRef(onSelectNote);
  onMapClickRef.current = onMapClick;
  onSelectNoteRef.current = onSelectNote;

  // 지도 1회 초기화
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current).setView(SEOUL, 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    markerLayer.current = L.layerGroup().addTo(map);
    queryLayer.current = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 노트 마커 갱신
  useEffect(() => {
    const layer = markerLayer.current;
    if (!layer) return;
    layer.clearLayers();
    const pts = pointsOf(notes);
    for (const p of pts) {
      const selected = p.path === selectedPath;
      L.circleMarker([p.lat, p.lng], {
        radius: selected ? 9 : 6,
        color: selected ? '#b45309' : '#2563eb',
        weight: 2,
        fillColor: selected ? '#f59e0b' : '#3b82f6',
        fillOpacity: 0.85,
      })
        .bindTooltip(p.title, { direction: 'top' })
        .on('click', () => onSelectNoteRef.current(p.path))
        .addTo(layer);
    }
    if (selectedPath) {
      const sel = pts.find((p) => p.path === selectedPath);
      if (sel) mapRef.current?.panTo([sel.lat, sel.lng]);
    }
  }, [notes, selectedPath]);

  // 검색 기준점 + 반경 원 갱신
  useEffect(() => {
    const layer = queryLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!queryPoint) return;
    L.circle([queryPoint.lat, queryPoint.lng], {
      radius: radiusMeters,
      color: '#059669',
      weight: 1,
      fillColor: '#10b981',
      fillOpacity: 0.08,
    }).addTo(layer);
    L.circleMarker([queryPoint.lat, queryPoint.lng], {
      radius: 7,
      color: '#065f46',
      weight: 3,
      fillColor: '#34d399',
      fillOpacity: 1,
    })
      .bindTooltip('검색 기준점', { direction: 'top' })
      .addTo(layer);
  }, [queryPoint, radiusMeters]);

  return <div ref={elRef} className="map" />;
}
