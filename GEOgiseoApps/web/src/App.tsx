import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  normalizeTags,
  type LatLng,
  type LocationNote,
} from '@geogiseo/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { getCurrentFix, getQuickFix } from './geolocation.js';
import { noteFilenameByTimePlace, uniquePath } from './notes.js';
import { isVaultSupported, pickVault, restoreVault, type Vault } from './vault.js';
import { NativeMap, type NativeMapMarker } from './nativeMap.js';
import { WatchBridge } from './watchBridge.js';
import { loadPlaces, cachePlaces, restorePlaces, persistPlaces, type FavoritePlace } from './places.js';

// ── Types ─────────────────────────────────────────────────
type Tab = 'new' | 'map' | 'notes' | 'settings';
type Source = { kind: 'none' } | { kind: 'sample' } | { kind: 'folder'; vault: Vault; name: string };

interface Draft {
  base: LocationNote | null;
  title: string;
  lat: string;
  lng: string;
  place: string;
  tags: string;
  body: string;
  appendBody: string;
  _initBody: string; // 변경 감지용 — 노트를 열었을 때의 body
  _initLat: string;  // 변경 감지용 — 노트를 열었을 때의 좌표
  _initLng: string;
  locManual?: boolean; // 사용자가 위치를 직접 지정했는지(검색/지도/현재위치) — 신규 노트 자동 위치 덮어쓰기 방지
  accuracy?: number;
}

interface PlaceFormState {
  id: string;
  name: string;
  emoji: string;
  lat: number;
  lng: number;
  radiusM: number;
  tag: string;
}

interface SearchResult {
  name: string;
  lat: number;
  lng: number;
}

// ── Constants ─────────────────────────────────────────────
const SEOUL: LatLng = { lat: 37.5665, lng: 126.978 };
const LAST_LOC_KEY = 'geogiseo-last-loc';
// 이보다 오래된 캐시는 콜드 스타트 시작값으로 쓰지 않는다(너무 옛 위치일 확률).
const LOC_SEED_MAX_AGE = 12 * 3_600_000; // 12시간

// 마지막으로 확인된 위치 — 콜드 스타트 시 GPS를 기다리지 않고 즉시 이 위치로 시작한다.
function loadLastLoc(): LatLng | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_LOC_KEY) ?? 'null');
    if (!v || typeof v.lat !== 'number' || typeof v.lng !== 'number') return null;
    if (typeof v.ts === 'number' && Date.now() - v.ts > LOC_SEED_MAX_AGE) return null; // 너무 오래됨
    return { lat: v.lat, lng: v.lng };
  } catch { return null; }
}
// Nominatim 사용 정책상 식별 가능한 User-Agent 필요.
const NOMINATIM_UA = 'GEOgiseo/1.0 (app.geogiseo)';

// ── Helpers ───────────────────────────────────────────────
function emptyDraft(at: LatLng): Draft {
  return { base: null, title: '', lat: String(at.lat), lng: String(at.lng), place: '', tags: '', body: '', appendBody: '', _initBody: '', _initLat: String(at.lat), _initLng: String(at.lng) };
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' });
}

// 날짜 헤더가 없는 목록(장소별·검색·주변 카드)용 — 오늘은 시간만, 그 외엔 날짜를 붙인다.
function fmtWhen(iso: string | undefined): string {
  if (!iso) return '날짜 없음';
  const d = new Date(iso);
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === new Date().toDateString()) return fmtTime(iso);
  if (d.toDateString() === yesterday.toDateString()) return `어제 ${fmtTime(iso)}`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('ko', sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateHeader(iso: string | undefined): string {
  if (!iso) return '날짜 없음';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return '오늘';
  if (d.toDateString() === yesterday.toDateString()) return '어제';
  return d.toLocaleDateString('ko', { month: 'long', day: 'numeric', weekday: 'short' });
}

// 본문은 파일 그대로 다룬다. (예전엔 첫 줄이 제목과 같으면 화면에서 빼고 저장 시 다시 붙였는데,
// 한 줄 메모는 이어서 기록 후 다시 열면 기존 내용이 헤더로만 가고 본문에서 사라져 보였다)
function draftFromNote(n: LocationNote): Draft {
  const loc = n.location ?? n.locations[0] ?? SEOUL;
  const title = n.title ?? '';
  const body = n.body;
  return {
    base: n,
    title,
    lat: String(loc.lat),
    lng: String(loc.lng),
    place: n.place ?? '',
    tags: n.tags.join(', '),
    body,
    appendBody: '',
    _initBody: body,
    _initLat: String(loc.lat),
    _initLng: String(loc.lng),
    ...(n.accuracy !== undefined ? { accuracy: n.accuracy } : {}),
  };
}

// ── Geo math ──────────────────────────────────────────────
function toRad(d: number) { return (d * Math.PI) / 180; }

function bearingDeg(from: LatLng, to: LatLng): number {
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat), lat2 = toRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
function bearingArrow(deg: number): string {
  return ARROWS[Math.round(deg / 45) % 8] ?? '↑';
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

function placeEffectiveTag(p: FavoritePlace): string {
  return p.tag.trim() || p.name.toLowerCase().replace(/\s+/g, '-');
}

// captureLocName 등에서 순수 장소 문자열만 추출 (이모지·플레이스홀더 제거)
function cleanPlace(s: string | undefined): string {
  if (!s) return '';
  const t = s.replace(/^[\p{Extended_Pictographic}️\s]+/u, '').trim();
  if (!t || /갱신 중|확인 중|위치 없음/.test(t)) return '';
  return t;
}

// 마크다운 목록(순서/불릿)에서 엔터 시 다음 줄에 마커 자동 생성. 빈 목록 줄이면 마커 제거 후 탈출.
function handleListEnter(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  onChange: (next: string) => void,
) {
  if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
  const el = e.currentTarget;
  if (el.selectionStart !== el.selectionEnd) return;
  const pos = el.selectionStart;
  const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
  const line = value.slice(lineStart, pos);

  const ordered = line.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
  const bullet = !ordered ? line.match(/^(\s*)([-*])\s+(.*)$/) : null;
  if (!ordered && !bullet) return;

  e.preventDefault();
  const indent = (ordered ?? bullet)![1];
  const content = ordered ? ordered[4] : bullet![3];
  const marker = ordered ? `${Number(ordered[2]) + 1}${ordered[3]}` : bullet![2];

  let newValue: string, newPos: number;
  if (!content!.trim()) {
    newValue = value.slice(0, lineStart) + value.slice(pos);
    newPos = lineStart;
  } else {
    const insert = `\n${indent}${marker} `;
    newValue = value.slice(0, pos) + insert + value.slice(pos);
    newPos = pos + insert.length;
  }
  onChange(newValue);
  requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = newPos; });
}

// '이어서 기록' 구분 마커 — 저장 형식(`---` + `*시각*`)은 마크다운 호환을 위해 유지하고,
// 미리보기·검색·복사에서만 걸러낸다. 예전 형식(`*오후 09:05*`)도 함께 인식.
const APPEND_STAMP_RE = /^\*((?:\d{1,2}\/\d{1,2} )?(?:오전 |오후 )?\d{1,2}:\d{2})\*$/;
const APPEND_MARK_RE = /^(-{3,}|\*(\d{1,2}\/\d{1,2} )?(오전 |오후 )?\d{1,2}:\d{2}\*)$/;

type BodySegment = { kind: 'text'; text: string } | { kind: 'sep'; stamp: string };

// 읽기 화면용 — 본문을 텍스트 덩어리와 '이어서 기록' 구분선(시각)으로 나눈다.
function splitBodySegments(body: string): BodySegment[] {
  const lines = body.split('\n');
  const segs: BodySegment[] = [];
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join('\n').replace(/^\s*\n/, '').trimEnd();
    if (text.trim()) segs.push({ kind: 'text', text });
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (!/^-{3,}$/.test(lines[i]!.trim())) { buf.push(lines[i]!); continue; }
    // 구분선 다음(빈 줄 건너뛰고) 시각 줄이 오면 함께 묶는다
    let j = i + 1;
    while (j < lines.length && !lines[j]!.trim()) j++;
    const m = j < lines.length ? lines[j]!.trim().match(APPEND_STAMP_RE) : null;
    flush();
    segs.push({ kind: 'sep', stamp: m?.[1] ?? '' });
    if (m) i = j;
  }
  flush();
  return segs;
}

// 한 노트 안의 기록 개수 — 처음 기록 1개 + '이어서 기록'(시각 있는 구분선) 수
function countEntries(body: string): number {
  return 1 + splitBodySegments(body).filter((s) => s.kind === 'sep' && s.stamp).length;
}

function NoteReadView({ body }: { body: string }) {
  const segs = splitBodySegments(body);
  if (!segs.length) return <p className="muted note-read-empty">내용 없음</p>;
  return (
    <>
      {segs.map((s, i) =>
        s.kind === 'sep' ? (
          <div key={i} className="note-edit-divider note-read-sep">
            {s.stamp && <span className="note-edit-time">{s.stamp}</span>}
          </div>
        ) : (
          <div key={i} className="note-read-text">{s.text}</div>
        ),
      )}
    </>
  );
}

function stripAppendMarks(body: string): string {
  return body.split('\n').filter((l) => !APPEND_MARK_RE.test(l.trim())).join('\n');
}

// 이어서 기록 시각 — 며칠 뒤에 덧붙여도 구분되도록 날짜 포함 (예: 10/06 21:05)
function fmtAppendStamp(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getMonth() + 1}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 클립보드 복사 — Clipboard API가 막힌 환경(구형 WebView 등)은 execCommand로 폴백
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const prev = document.activeElement as HTMLElement | null;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', ''); // iOS에서 키보드가 뜨지 않게
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(0, text.length); // iOS는 select()만으로는 선택이 안 된다
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(ta);
    prev?.focus({ preventScroll: true });
    return ok;
  }
}

// 메모 리스트용 본문 미리보기 — 첫 줄 + 나머지 요약
function notePreview(body: string): { first: string; rest: string } {
  const lines = stripAppendMarks(body).split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).filter(Boolean);
  return { first: lines[0] ?? '빈 메모', rest: lines.slice(1).join('  ') };
}

// 노트의 장소 이름 — 반경 안 즐겨찾기 우선, 없으면 저장된 place, 없으면 빈 문자열
function notePlaceName(n: LocationNote, places: FavoritePlace[]): string {
  const loc = n.location ?? n.locations[0];
  if (loc) {
    const p = places.find((fp) => distanceM(loc, { lat: fp.lat, lng: fp.lng }) <= fp.radiusM);
    if (p) return `${p.emoji ? p.emoji + ' ' : ''}${p.name}`;
  }
  return n.place ?? '';
}

// ── Icons ─────────────────────────────────────────────────
function IconCompose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  );
}

function IconMap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
      <line x1="8" y1="2" x2="8" y2="18"/>
      <line x1="16" y1="6" x2="16" y2="22"/>
    </svg>
  );
}

function IconNote() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="13" y2="17"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function IconLocate() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="2" x2="12" y2="7"/>
      <line x1="12" y1="17" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="7" y2="12"/>
      <line x1="17" y1="12" x2="22" y2="12"/>
    </svg>
  );
}

// ── SwipeToDelete ─────────────────────────────────────────
function SwipeToDelete({
  onDelete,
  deleteLabel,
  children,
}: {
  onDelete: () => void;
  deleteLabel: string;
  children: React.ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const startRevealed = useRef(false);
  const isSwiping = useRef(false);
  // 세로 스크롤로 판정된 제스처는 끝날 때까지 스와이프 무시
  const isScrolling = useRef(false);
  const REVEAL_W = 76;

  const currentX = dragging ? dragX : (revealed ? -REVEAL_W : 0);

  return (
    <div className="swipe-row">
      <div
        className="swipe-action"
        // 닫힌 상태에선 숨김 — iOS 스크롤 중 둥근 모서리 틈으로 빨간 배경이 비치는 현상 방지
        style={{ width: REVEAL_W, visibility: currentX < 0 ? 'visible' : 'hidden' }}
      >
        <button className="swipe-action-btn" onClick={onDelete} aria-label={deleteLabel}>삭제</button>
      </div>
      <div
        className="swipe-fg"
        style={{
          transform: `translateX(${currentX}px)`,
          transition: dragging ? 'none' : 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        onTouchStart={(e) => {
          startX.current = e.touches[0]?.clientX ?? 0;
          startY.current = e.touches[0]?.clientY ?? 0;
          startRevealed.current = revealed;
          isSwiping.current = false;
          isScrolling.current = false;
          setDragging(false);
        }}
        onTouchMove={(e) => {
          if (isScrolling.current) return;
          const dx = (e.touches[0]?.clientX ?? 0) - startX.current;
          const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
          if (!isSwiping.current) {
            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
            // 세로 이동이 더 크면 스크롤로 확정 → 카드 이동 안 함
            if (Math.abs(dy) >= Math.abs(dx)) { isScrolling.current = true; return; }
            isSwiping.current = true;
            setDragging(true);
          }
          const base = startRevealed.current ? -REVEAL_W : 0;
          setDragX(Math.min(0, Math.max(base + dx, -REVEAL_W)));
        }}
        onTouchEnd={() => {
          if (!isSwiping.current) return;
          setDragging(false);
          setRevealed(dragX < -REVEAL_W / 2);
        }}
        onClick={() => { if (revealed) setRevealed(false); }}
      >
        {children}
      </div>
    </div>
  );
}

// ── 지도 기간 필터 ──────────────────────────────────────
interface PeriodBucket {
  key: string;
  label: string;
  /** [start, end) epoch ms */
  start: number;
  end: number;
  count: number;
}

const DAY_MS = 86_400_000;

/**
 * 노트 시각을 기간 구간으로 나눈다 (예전 → 최근 순).
 * 노트가 쌓인 기간에 맞춰 단위를 고른다: 2주 이내 = 일, 4개월 이내 = 주, 그 이상 = 월.
 */
function periodBuckets(times: number[]): PeriodBucket[] {
  if (!times.length) return [];
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = max - min;
  const unit: 'day' | 'week' | 'month' = span <= 14 * DAY_MS ? 'day' : span <= 120 * DAY_MS ? 'week' : 'month';

  const startOf = (t: number): Date => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    if (unit === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 월요일 시작
    if (unit === 'month') d.setDate(1);
    return d;
  };
  const next = (d: Date): Date => {
    const n = new Date(d);
    if (unit === 'day') n.setDate(n.getDate() + 1);
    else if (unit === 'week') n.setDate(n.getDate() + 7);
    else n.setMonth(n.getMonth() + 1);
    return n;
  };
  const label = (d: Date): string => {
    const md = `${d.getMonth() + 1}월 ${d.getDate()}일`;
    if (unit === 'day') return md;
    if (unit === 'week') return `${md} 주`;
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  };

  // 노트가 있는 구간만 만든다 (빈 구간은 건너뛰어 슬라이드 한 칸 = 볼 거리 있음)
  const byKey = new Map<number, PeriodBucket>();
  for (const t of times) {
    const s = startOf(t);
    const k = s.getTime();
    const b = byKey.get(k);
    if (b) b.count += 1;
    else byKey.set(k, { key: `${unit}-${k}`, label: label(s), start: k, end: next(s).getTime(), count: 1 });
  }
  return [...byKey.values()].sort((a, b) => a.start - b.start);
}

// ── MapPane (지도 탭 — 네이티브 지도를 탭 영역에 임베드) ──
interface MapPaneProps {
  markers: NativeMapMarker[];
  /** 위에 웹 오버레이(편집기/시트)가 떠 있으면 false — 네이티브 지도는 웹뷰 위라 가린다. */
  active: boolean;
  center: LatLng;
  onSilentLocate: () => void;
  /** 지도 아래(탭바 위)에 붙는 웹 UI — 네이티브 지도는 이 위까지만 그린다. */
  footer?: React.ReactNode;
}

function MapPane({ markers, active, center, onSilentLocate, footer }: MapPaneProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const centerRef = useRef(center);
  centerRef.current = center;

  // 탭 진입 시 즉시 + 30초마다 조용히 위치 갱신
  useEffect(() => {
    onSilentLocate();
    const id = setInterval(onSilentLocate, 30_000);
    return () => clearInterval(id);
  }, []);

  // 슬롯 영역에 맞춰 네이티브 지도를 띄우고, 비활성/탭 이탈 시 숨긴다(상태는 네이티브에 유지).
  useEffect(() => {
    const el = slotRef.current;
    if (!active || !el) return;
    let first = true;
    const sync = () => {
      // 화면 맨 위부터 하단 탭바 바로 위까지 꽉 채운다 — 네이티브 지도는 웹뷰 위라 탭바를 덮으면 안 됨.
      // 가장자리는 네이티브에서 페이드 처리돼 아래 배경과 자연스럽게 이어진다.
      // 하단 필터 바가 있으면 그 위까지만 (웹 UI가 지도에 가리지 않게)
      const r = el.getBoundingClientRect();
      const footerTop = footerRef.current?.getBoundingClientRect().top;
      const navTop = document.querySelector('.bottom-nav')?.getBoundingClientRect().top;
      const bottom = footerTop != null ? footerTop : navTop != null ? navTop - 4 : r.bottom;
      const { lat, lng } = centerRef.current;
      NativeMap.embed({ x: 0, y: 0, width: window.innerWidth, height: Math.max(0, bottom), lat, lng })
        .then(() => {
          if (!first) return;
          first = false;
          return NativeMap.setEmbedMarkers({ markers: markersRef.current });
        })
        .catch(() => {});
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      NativeMap.hideEmbed().catch(() => {});
    };
  }, [active]);

  // 노트/장소가 바뀌면 핀만 갱신
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (active) NativeMap.setEmbedMarkers({ markers }).catch(() => {});
  }, [markers]);

  return (
    <div className="tab-pane map-pane">
      <div className="map-slot" ref={slotRef} />
      {footer && <div className="map-footer" ref={footerRef}>{footer}</div>}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<Tab>('new'); // 첫 화면은 바로 메모 작성
  const [source, setSource] = useState<Source>({ kind: 'none' });
  const [notes, setNotes] = useState<LocationNote[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  // 마지막 위치로 즉시 시작 — GPS 확보 전에도 위치 기반 기능이 바로 동작
  const [queryPoint, setQueryPoint] = useState<LatLng | null>(loadLastLoc);
  const [myLocation, setMyLocation] = useState<LatLng | null>(loadLastLoc);
  // 이번 세션에서 실제 fix를 한 번이라도 받았는지 — false면 위치가 '직전 캐시'(신선하지 않음)
  const [locFresh, setLocFresh] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [favoritePlaces, setFavoritePlaces] = useState<FavoritePlace[]>(loadPlaces);
  const [placesBusy, setPlacesBusy] = useState(false);
  const [placesReady, setPlacesReady] = useState(true);
  const placesBusyRef = useRef(false);
  const [placeForm, setPlaceForm] = useState<PlaceFormState | null>(null);
  const [placeSearch, setPlaceSearch] = useState('');
  const [placeSearchResults, setPlaceSearchResults] = useState<SearchResult[]>([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [captureLocName, setCaptureLocName] = useState('위치 확인 중…');
  const [notesView, setNotesView] = useState<'date' | 'place'>('place');
  const [locSheet, setLocSheet] = useState(false); // 노트 위치 조정 시트
  const [noteQuery, setNoteQuery] = useState(''); // 메모 탭 검색어
  const [copied, setCopied] = useState(false); // 편집 화면 '복사됨' 피드백
  const [pendingDeletion, setPendingDeletion] = useState<LocationNote | null>(null);
  // 기존 노트 상단(기존 내용) 표시 모드 — 미리보기 / 탭하면 크게 읽기 / '편집'으로 수정
  const [existingMode, setExistingMode] = useState<'preview' | 'read' | 'edit'>('preview');
  // 키보드 위 '보이는 영역' 크기 — 작성 에디터를 여기에 딱 맞춰 하단바가 키보드에 붙게 한다.
  const [viewport, setViewport] = useState<{ h: number | null; top: number }>({ h: null, top: 0 });
  const [keyboardH, setKeyboardH] = useState(0); // iOS 앱 전용: 플러그인이 알려주는 키보드 높이
  const newNoteInputRef = useRef<HTMLTextAreaElement | null>(null);
  const appendInputRef = useRef<HTMLTextAreaElement | null>(null); // 기존 노트 '이어서 기록' 칸
  const savingRef = useRef(false); // saveDraft 재진입(중복 저장) 방지
  const pendingDeletionRef = useRef<LocationNote | null>(null);
  const deletionTimerRef = useRef<number | null>(null);

  const existingPaths = useMemo(
    () => new Set(notes.map((n) => n.path).filter((p): p is string => !!p)),
    [notes],
  );

  // 신선한(이번 세션) 위치만 캐시에 저장 → 다음 콜드 스타트에서 타임스탬프로 신선도 판단
  useEffect(() => {
    if (myLocation && locFresh) {
      localStorage.setItem(LAST_LOC_KEY, JSON.stringify({ ...myLocation, ts: Date.now() }));
    }
  }, [myLocation?.lat, myLocation?.lng, locFresh]);

  // 첫 화면: 바로 메모 작성 상태로 연다
  useEffect(() => { newNote(); }, []);

  // iOS WKWebView에서 첫 렌더 직후 autoFocus가 누락되는 경우가 있어 몇 프레임 동안 보강한다.
  useEffect(() => {
    if (tab !== 'new' || !draft || draft.base) return;
    const focusEditor = () => newNoteInputRef.current?.focus({ preventScroll: true });
    let raf2 = 0;
    focusEditor();
    const raf1 = requestAnimationFrame(() => {
      focusEditor();
      raf2 = requestAnimationFrame(focusEditor);
    });
    const timeout = window.setTimeout(focusEditor, 250);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(timeout);
    };
  }, [tab, draft?.base]);

  // iOS 앱: Keyboard 플러그인 resize:'none'이라 웹뷰가 줄지 않고 visualViewport도 그대로다.
  // keyboardWillShow 이벤트(키보드 애니메이션 시작 시점)의 높이로 에디터 하단을 키보드 위에 맞춘다.
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'ios') return;
    const subs = [
      Keyboard.addListener('keyboardWillShow', (info) => setKeyboardH(info.keyboardHeight)),
      Keyboard.addListener('keyboardWillHide', () => setKeyboardH(0)),
    ];
    return () => { subs.forEach((s) => void s.then((h) => h.remove())); };
  }, []);

  // 웹(브라우저): 키보드가 뜨면 visualViewport.height가 그만큼 줄어든다.
  // 에디터 높이를 여기에 맞추면 하단바가 키보드 바로 위에 붙는다.
  useEffect(() => {
    if (Capacitor.getPlatform() === 'ios') return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewport({ h: vv.height, top: vv.offsetTop });
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);

  // 하단 시트(장소 추가·위치 지정)도 키보드 위로 올린다. 에디터와 같은 규칙.
  const sheetOverlayStyle: React.CSSProperties | undefined =
    keyboardH > 0
      ? { bottom: keyboardH }
      : viewport.h != null
        ? { top: viewport.top, height: viewport.h, bottom: 'auto' }
        : undefined;

  // 키보드가 올라오면 시트 안에서 포커스된 입력칸이 보이도록 스크롤한다.
  useEffect(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || !el.closest('.editor-inner')) return;
    const t = window.setTimeout(() => el.scrollIntoView({ block: 'center' }), 50);
    return () => window.clearTimeout(t);
  }, [keyboardH, viewport.h]);

  // 키보드가 떠 있는 채로 다른 입력칸으로 옮겨갈 때도 그 칸이 보이게 한다.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLElement) || !el.closest('.editor-inner')) return;
      window.setTimeout(() => el.scrollIntoView({ block: 'center' }), 300);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  // 2단계 위치 확보: 빠른 대략 위치(Wi-Fi/셀) 먼저 → 정밀 GPS로 갱신
  useEffect(() => {
    let done = false;
    getQuickFix()
      .then((fix) => { if (!done) { setMyLocation(fix.coords); setQueryPoint(fix.coords); setLocFresh(true); } })
      .catch(() => {});
    getCurrentFix()
      .then((fix) => { done = true; setMyLocation(fix.coords); setQueryPoint(fix.coords); setLocFresh(true); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (placesBusyRef.current) return;
    const vault = restoreVault();
    if (!vault) return;
    setPlacesBusyState(true);
    setNotesLoading(true);
    (async () => {
      try {
        const loaded = await vault.readAll();
        setSource({ kind: 'folder', vault, name: vault.name });
        setNotes(loaded);
        await loadFolderPlaces(vault);
      } catch (e) {
        setError(`저장된 폴더를 열지 못했습니다: ${(e as Error).message}`);
      } finally {
        setNotesLoading(false);
        setPlacesBusyState(false);
      }
    })();
  }, []);

  function setPlacesBusyState(busy: boolean) {
    placesBusyRef.current = busy;
    setPlacesBusy(busy);
  }

  async function loadFolderPlaces(vault: Vault) {
    setPlacesReady(false);
    setPlaceForm(null);
    try {
      const places = await restorePlaces(vault, loadPlaces());
      cachePlaces(places);
      setFavoritePlaces(places);
      setPlacesReady(true);
    } catch (e) {
      setError(`즐겨찾기를 불러오지 못했습니다. 보관함을 새로고침해 다시 시도하세요: ${(e as Error).message}`);
    }
  }

  async function openFolder() {
    if (placesBusyRef.current) return;
    setPlacesBusyState(true);
    setError(null);
    try {
      const vault = await pickVault();
      const loaded = await vault.readAll();
      setSource({ kind: 'folder', vault, name: vault.name });
      setNotes(loaded);
      setSelectedPath(null);
      await loadFolderPlaces(vault);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
    } finally {
      setPlacesBusyState(false);
    }
  }

  async function refresh(includePlaces = false) {
    if (source.kind !== 'folder') return;
    if (includePlaces && placesBusyRef.current) return;
    if (includePlaces) { setPlacesBusyState(true); setError(null); }
    setNotesLoading(true);
    try {
      const loaded = await source.vault.readAll();
      const pendingPath = pendingDeletionRef.current?.path;
      setNotes(pendingPath ? loaded.filter((n) => n.path !== pendingPath) : loaded);
      if (includePlaces) await loadFolderPlaces(source.vault);
    }
    catch (e) {
      if (!includePlaces) throw e;
      setError(`보관함을 새로고침하지 못했습니다: ${(e as Error).message}`);
    }
    finally {
      setNotesLoading(false);
      if (includePlaces) setPlacesBusyState(false);
    }
  }

  function selectNote(path: string) {
    setSelectedPath(path);
    const n = notes.find((x) => x.path === path);
    if (n) { setDraft(draftFromNote(n)); setExistingMode('preview'); }
  }

  function newNote() {
    setSelectedPath(null);
    setDraft(emptyDraft(myLocation ?? queryPoint ?? SEOUL));
  }

  function closeDraft() {
    setDraft(null);
    if (tab === 'new') setTab('notes');
  }

  async function locateMe() {
    setError(null);
    setLocating(true);
    try {
      const fix = await getCurrentFix();
      setMyLocation(fix.coords);
      setQueryPoint(fix.coords);
      setLocFresh(true);
    } catch (e) {
      setError(`위치를 가져오지 못했습니다: ${(e as Error).message}`);
    } finally {
      setLocating(false);
    }
  }

  async function silentLocate() {
    try {
      const fix = await getCurrentFix();
      // GPS 흔들림(jitter)으로 인한 불필요한 재계산/역지오코딩 방지 — 5m 미만 이동은 무시
      setMyLocation((prev) => (prev && distanceM(prev, fix.coords) < 5 ? prev : fix.coords));
      setQueryPoint((prev) => (prev && distanceM(prev, fix.coords) < 5 ? prev : fix.coords));
      setLocFresh(true);
    } catch {}
  }

  // 위치가 바뀌면 근처 지명 업데이트 (신규 노트 헤더용)
  useEffect(() => {
    if (!myLocation) { setCaptureLocName('위치 없음'); return; }
    // 아직 이번 세션 fix가 없으면(직전 캐시 위치) 옛 지명을 보여주지 않고 갱신 중 표시
    if (!locFresh) { setCaptureLocName('위치 갱신 중…'); return; }
    // 즐겨찾기 장소 안에 있으면 장소 이름 우선
    const inside = favoritePlaces.find(
      (p) => distanceM(myLocation, { lat: p.lat, lng: p.lng }) <= p.radiusM
    );
    if (inside) { setCaptureLocName(`${inside.emoji ?? '📍'} ${inside.name}`); return; }
    // Nominatim 역지오코딩 — 네이티브 HTTP(CapacitorHttp)로 호출해 User-Agent 지정
    setCaptureLocName('위치 확인 중…');
    const { lat, lng } = myLocation;
    CapacitorHttp.get({
      url: `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      headers: { 'Accept-Language': 'ko', 'User-Agent': NOMINATIM_UA },
    })
      .then((res) => {
        const data: any = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        const a = data.address ?? {};
        const name = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.village ?? a.town ?? a.city ?? a.county;
        const city = a.city ?? a.town ?? a.county ?? '';
        setCaptureLocName(name ? `${name}, ${city}`.replace(/, $/, '') : (data.display_name?.split(',')[0] ?? '알 수 없는 위치'));
      })
      .catch(() => setCaptureLocName('위치 없음'));
  }, [myLocation?.lat, myLocation?.lng, locFresh]);

  // path로 노트 파일을 실제 삭제 — 편집 화면의 확인 삭제와 지연 삭제 확정에서 공용.
  async function deleteNoteByPath(path: string): Promise<boolean> {
    try {
      if (source.kind === 'folder') {
        await source.vault.delete(path);
        await refresh();
      } else {
        setNotes((prev) => prev.filter((n) => n.path !== path));
      }
      if (selectedPath === path) setSelectedPath(null);
      return true;
    } catch (e) {
      setError(`삭제 실패: ${(e as Error).message}`);
      return false;
    }
  }

  function restoreDeletedNote(note: LocationNote) {
    setNotes((prev) => prev.some((n) => n.path === note.path) ? prev : [...prev, note]);
  }

  async function commitPendingDeletion(note: LocationNote) {
    if (deletionTimerRef.current !== null) {
      window.clearTimeout(deletionTimerRef.current);
      deletionTimerRef.current = null;
    }
    if (pendingDeletionRef.current?.path === note.path) {
      pendingDeletionRef.current = null;
      setPendingDeletion(null);
    }
    if (!(await deleteNoteByPath(note.path as string))) restoreDeletedNote(note);
  }

  // 리스트에서는 즉시 사라지게 하고 잠시 실행 취소 기회를 준 뒤 파일을 실제 삭제한다.
  function scheduleNoteDeletion(note: LocationNote) {
    const previous = pendingDeletionRef.current;
    if (previous) void commitPendingDeletion(previous);

    setNotes((prev) => prev.filter((n) => n.path !== note.path));
    if (selectedPath === note.path) setSelectedPath(null);
    if (draft?.base?.path === note.path) setDraft(null);

    pendingDeletionRef.current = note;
    setPendingDeletion(note);
    deletionTimerRef.current = window.setTimeout(() => {
      void commitPendingDeletion(note);
    }, 5_000);
  }

  function undoNoteDeletion() {
    const note = pendingDeletionRef.current;
    if (!note) return;
    if (deletionTimerRef.current !== null) window.clearTimeout(deletionTimerRef.current);
    deletionTimerRef.current = null;
    pendingDeletionRef.current = null;
    setPendingDeletion(null);
    restoreDeletedNote(note);
  }

  async function deleteCurrentNote() {
    if (!draft?.base?.path) return;
    if (!window.confirm('이 노트를 삭제할까요?')) return;
    if (await deleteNoteByPath(draft.base.path)) closeDraft();
  }

  async function saveDraft() {
    if (!draft) return;
    setError(null);
    const lat = Number(draft.lat);
    const lng = Number(draft.lng);
    // 신규 노트는 작성 사이에 도착한 최신(정밀) 위치를 우선 사용.
    // 단, 사용자가 위치를 직접 지정(검색/지도/현재위치)했으면 그 좌표를 존중.
    const eff: LatLng = (tab === 'new' && myLocation && !draft.locManual) ? myLocation : { lat, lng };
    const isNew = tab === 'new';
    if (!draft.body.trim() && isNew) return; // 내용 없으면 저장 안 함
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return setError('좌표가 올바르지 않습니다.');

    // 기존 노트: 변경 없으면 저장 없이 닫기 (불필요한 refresh 방지)
    const appendTrimmed = draft.appendBody.trim();
    const locChanged = draft.lat !== draft._initLat || draft.lng !== draft._initLng;
    if (!isNew && !appendTrimmed && draft.body === draft._initBody && !locChanged) {
      setExistingMode('preview');
      return;
    }

    const base = draft.base;
    const capturedAt = base?.capturedAt ?? new Date().toISOString();
    const noteLoc: LatLng = eff;

    // 장소 이름: 사용자가 지정한 place > 반경 안 즐겨찾기 > (자동 위치일 때만) 역지오코딩.
    const insideFav = favoritePlaces.find((p) => distanceM(noteLoc, { lat: p.lat, lng: p.lng }) <= p.radiusM);
    const placeName = draft.place.trim()
      ? draft.place.trim()
      : insideFav ? insideFav.name
      : (!draft.locManual ? cleanPlace(captureLocName) : '');

    // 이어서 기록이 있으면 구분선 + 시각 + 내용을 body에 추가
    // (기존 본문 끝 공백/빈 줄은 정리해 구분선 앞 빈 줄이 늘어나지 않게 한다)
    const finalBody = appendTrimmed
      ? draft.body.trimEnd() + '\n\n---\n*' + fmtAppendStamp(new Date()) + '*\n\n' + appendTrimmed
      : draft.body;

    const manualTags = draft.tags.split(',').map((t) => t.trim()).filter(Boolean);
    const autoTags = favoritePlaces
      .filter((p) => distanceM(noteLoc, { lat: p.lat, lng: p.lng }) <= p.radiusM)
      .map(placeEffectiveTag);
    const mergedTagsStr = [...new Set([...manualTags, ...autoTags])].join(', ');

    // 파일명: 기존 노트는 그대로, 신규는 시간+장소 기반 (제목 불필요)
    const path = base?.path ?? uniquePath(noteFilenameByTimePlace(capturedAt, placeName), existingPaths);

    // 제목: 파일에 원래 있던 title만 그대로 보존. 본문에서 새로 유도하지 않는다.
    const title = !isNew ? (base?.title || undefined) : undefined;

    const note: LocationNote = {
      path,
      ...(title ? { title } : {}),
      location: eff,
      locations: base?.locations ?? [],
      capturedAt,
      ...(placeName ? { place: placeName } : (draft.place.trim() ? { place: draft.place.trim() } : {})),
      ...(draft.accuracy !== undefined ? { accuracy: draft.accuracy } : {}),
      tags: normalizeTags(mergedTagsStr),
      extraFrontmatter: base?.extraFrontmatter ?? {},
      body: finalBody,
    };

    if (savingRef.current) return; // 빠른 이중 탭 등으로 인한 중복 저장 방지
    savingRef.current = true;
    try {
      if (source.kind === 'folder') {
        await source.vault.write(note);
        await refresh();
      } else {
        setNotes((prev) => {
          const i = prev.findIndex((n) => n.path === path);
          if (i >= 0) { const copy = prev.slice(); copy[i] = note; return copy; }
          return [...prev, note];
        });
      }
      if (tab === 'new') {
        setDraft(null);
        setTab('notes');
      } else {
        // 기존 노트는 목록으로 나가지 않고 저장된 내용을 그 자리에서 다시 보여준다
        // (이어서 기록 칸은 비우고, 포커스는 유지돼 바로 다음 내용을 이어 쓸 수 있다)
        setDraft(draftFromNote(note));
        setExistingMode('preview');
        setSelectedPath(path);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      savingRef.current = false;
    }
  }

  // ── 워치 음성 메모 큐 처리 ──────────────────────────────
  // 워치에서 큐로 들어온 음성 메모를 폰이 열릴 때/도착 시 일괄 저장한다. (누락 없이 모았다가 저장)
  const drainingWatch = useRef(false);
  async function drainWatchNotes() {
    if (!Capacitor.isNativePlatform()) return;
    if (placesBusyRef.current || !placesReady) return;
    if (source.kind !== 'folder') return; // 저장할 vault가 없으면 큐를 유지하고 다음에 재시도
    if (drainingWatch.current) return;     // 동시 실행 방지
    drainingWatch.current = true;
    try {
      const { notes: pending } = await WatchBridge.getPending();
      if (!pending.length) return;

      const paths = new Set(existingPaths);
      const savedIds: string[] = [];
      let wrote = false;
      for (const it of pending) {
        const text = (it.text ?? '').trim();
        if (!text) { savedIds.push(it.id); continue; } // 빈 메모는 버림
        const loc: LatLng = (typeof it.lat === 'number' && typeof it.lng === 'number')
          ? { lat: it.lat, lng: it.lng }
          : (myLocation ?? SEOUL);
        const capturedAt = it.ts ? new Date(it.ts).toISOString() : new Date().toISOString();
        // 반경 안 즐겨찾기 → 장소 이름/자동 태그 (saveDraft와 동일 규칙)
        const inRadius = favoritePlaces.filter((p) => distanceM(loc, { lat: p.lat, lng: p.lng }) <= p.radiusM);
        const placeName = inRadius[0]?.name ?? it.place?.trim() ?? '';
        const path = uniquePath(noteFilenameByTimePlace(capturedAt, placeName), paths);
        paths.add(path);
        const note: LocationNote = {
          path,
          location: loc,
          locations: [],
          capturedAt,
          ...(placeName ? { place: placeName } : {}),
          ...(typeof it.accuracy === 'number' ? { accuracy: it.accuracy } : {}),
          tags: normalizeTags(inRadius.map(placeEffectiveTag).join(', ')),
          extraFrontmatter: {},
          body: text,
        };
        try {
          await source.vault.write(note);
          savedIds.push(it.id);
          wrote = true;
        } catch (e) {
          // 저장 실패 → ack하지 않고 다음 기회에 재시도 (누락 방지). 원인은 화면에 알린다.
          setError(`워치 메모 저장 실패: ${(e as Error).message}`);
          break;
        }
      }
      if (savedIds.length) await WatchBridge.ackPending({ ids: savedIds });
      if (wrote) await refresh();
    } catch (e) {
      // 큐는 유지되므로 다음 기회에 재시도
      setError(`워치 메모 불러오기 실패: ${(e as Error).message}`);
    } finally {
      drainingWatch.current = false;
    }
  }

  // 최신 클로저를 참조하도록 ref로 감싼다 (리스너 재등록 없이 최신 state 사용)
  const drainWatchRef = useRef(drainWatchNotes);
  useEffect(() => { drainWatchRef.current = drainWatchNotes; });

  // 워치 메모: 도착 시 + 포그라운드 복귀 시 큐 비우기
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = WatchBridge.addListener('watchNote', () => { drainWatchRef.current(); });
    const onVis = () => { if (document.visibilityState === 'visible') drainWatchRef.current(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      sub.then((h) => h.remove()).catch(() => {});
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // vault가 준비되면(복원 완료/변경) 대기 중이던 워치 메모를 저장
  useEffect(() => {
    if (source.kind === 'folder' && placesReady && !placesBusy) drainWatchRef.current();
  }, [source, placesReady, placesBusy]);

  // 즐겨찾기 장소를 워치에 전달 — 워치가 같은 기준(목록 순서상 첫 번째 반경 안 장소)으로 메모를 묶는다.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || placesBusyRef.current || !placesReady) return;
    const places = favoritePlaces.map(({ id, name, emoji, lat, lng, radiusM }) => ({
      id, name, lat, lng, radiusM, ...(emoji ? { emoji } : {}),
    }));
    WatchBridge.syncPlaces({ places }).catch(() => {});
  }, [favoritePlaces, placesBusy, placesReady]);

  // ── Favorite places ────────────────────────────────────
  function resetPlaceFormSearch() {
    setPlaceSearch('');
    setPlaceSearchResults([]);
  }

  function startAddPlace() {
    if (placesBusyRef.current || !placesReady) return;
    resetPlaceFormSearch();
    const loc = myLocation ?? SEOUL;
    setPlaceForm({ id: crypto.randomUUID(), name: '', emoji: '', lat: loc.lat, lng: loc.lng, radiusM: 200, tag: '' });
  }

  function startEditPlace(p: FavoritePlace) {
    if (placesBusyRef.current || !placesReady) return;
    resetPlaceFormSearch();
    setPlaceForm({ id: p.id, name: p.name, emoji: p.emoji ?? '', lat: p.lat, lng: p.lng, radiusM: p.radiusM, tag: p.tag });
  }

  function cancelPlaceForm() {
    if (placesBusyRef.current) return;
    setPlaceForm(null);
    resetPlaceFormSearch();
    NativeMap.hide().catch(() => {});
  }

  async function savePlaceForm() {
    if (placesBusyRef.current || !placesReady) return;
    if (!placeForm || !placeForm.name.trim()) {
      setError('장소 이름을 입력하세요.');
      return;
    }
    const updated = [
      ...favoritePlaces.filter((p) => p.id !== placeForm.id),
      { ...placeForm, name: placeForm.name.trim(), tag: placeForm.tag.trim() },
    ];
    if (await saveFavoritePlaces(updated)) {
      setPlaceForm(null);
      resetPlaceFormSearch();
    }
  }

  async function saveFavoritePlaces(updated: FavoritePlace[]): Promise<boolean> {
    if (placesBusyRef.current || !placesReady) return false;
    setPlacesBusyState(true);
    setError(null);
    try {
      await persistPlaces(source.kind === 'folder' ? source.vault : null, updated);
      setFavoritePlaces(updated);
      return true;
    } catch (e) {
      setError(`즐겨찾기를 저장하지 못했습니다: ${(e as Error).message}`);
      return false;
    } finally {
      setPlacesBusyState(false);
    }
  }

  async function deletePlace(id: string) {
    const updated = favoritePlaces.filter((p) => p.id !== id);
    await saveFavoritePlaces(updated);
  }

  async function useCurrentLocForPlace() {
    if (!placeForm) return;
    setLocating(true);
    try {
      const fix = await getCurrentFix();
      setPlaceForm({ ...placeForm, lat: fix.coords.lat, lng: fix.coords.lng });
      setMyLocation(fix.coords);
      setLocFresh(true);
    } catch (e) {
      setError(`위치를 가져오지 못했습니다: ${(e as Error).message}`);
    } finally {
      setLocating(false);
    }
  }

  async function searchPlaceName() {
    if (!placeSearch.trim()) return;
    setPlaceSearching(true);
    try {
      const resp = await CapacitorHttp.get({
        url: `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(placeSearch)}&limit=5`,
        headers: { 'Accept-Language': 'ko', 'User-Agent': NOMINATIM_UA },
      });
      const data: Array<{ display_name: string; lat: string; lon: string }> =
        typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
      setPlaceSearchResults(data.map((r) => ({ name: r.display_name, lat: Number(r.lat), lng: Number(r.lon) })));
    } catch {
      setError('검색에 실패했습니다. 네트워크를 확인하세요.');
    } finally {
      setPlaceSearching(false);
    }
  }

  // 네이티브 지도 picker가 'place'(즐겨찾기 편집)용인지 'note'(메모 위치 변경)용인지 구분
  const pickerTargetRef = useRef<'place' | 'note'>('place');

  function openNativePicker(lat?: number, lng?: number) {
    if (!placeForm) return;
    pickerTargetRef.current = 'place';
    NativeMap.showPicker({
      lat: lat ?? placeForm.lat,
      lng: lng ?? placeForm.lng,
      radiusM: placeForm.radiusM,
    }).catch(() => {});
  }

  // ── 메모 위치 변경 ──────────────────────────────────────
  function openNoteLocationPicker() {
    if (!draft) return;
    pickerTargetRef.current = 'note';
    const lat = Number(draft.lat), lng = Number(draft.lng);
    NativeMap.showPicker({
      lat: Number.isFinite(lat) ? lat : SEOUL.lat,
      lng: Number.isFinite(lng) ? lng : SEOUL.lng,
      radiusM: 0,
      showRadius: false,
    }).catch(() => {});
  }

  async function useCurrentLocForNote() {
    if (!draft) return;
    setLocating(true);
    try {
      const fix = await getCurrentFix();
      setMyLocation(fix.coords);
      setLocFresh(true);
      setDraft((d) => (d ? { ...d, lat: String(fix.coords.lat), lng: String(fix.coords.lng), accuracy: fix.accuracy, locManual: true, place: '' } : d));
      setLocSheet(false);
    } catch (e) {
      setError(`위치를 가져오지 못했습니다: ${(e as Error).message}`);
    } finally {
      setLocating(false);
    }
  }

  // ── 노트 위치 조정 시트 ──────────────────────────────────
  function openLocSheet() {
    resetPlaceFormSearch();
    setLocSheet(true);
  }
  function closeLocSheet() {
    setLocSheet(false);
    resetPlaceFormSearch();
  }
  // 검색 결과를 현재 노트 위치로 지정
  function pickSearchedForNote(r: SearchResult) {
    setDraft((d) => (d ? {
      ...d,
      lat: String(r.lat),
      lng: String(r.lng),
      place: r.name.split(',')[0]?.trim() ?? '',
      locManual: true,
    } : d));
    setPlaceSearchResults([]);
    setPlaceSearch('');
    setLocSheet(false);
  }

  // 지도 기간 필터 — 위치 있는 노트의 기록 시각으로 구간을 만든다. null = 전체.
  const [mapPeriodKey, setMapPeriodKey] = useState<string | null>(null);
  const mapBuckets = useMemo(() => periodBuckets(
    notes
      .filter((n) => n.path && (n.location ?? n.locations[0]))
      .map((n) => (n.capturedAt ? Date.parse(n.capturedAt) : NaN))
      .filter((t) => Number.isFinite(t)),
  ), [notes]);
  // 노트가 바뀌어 구간이 사라지면 전체로 되돌린다
  const mapPeriod = mapBuckets.find((b) => b.key === mapPeriodKey) ?? null;

  // 지도 탭 핀 — 반경 안 노트는 개별 핀 대신 장소로 흡수해 개수만 표시.
  // 노트 핀은 콜아웃용 미리보기(첫 줄/나머지)와 시간·장소를 함께 보낸다.
  // 기간 필터가 있으면 그 구간 노트만 핀/개수에 반영한다 (장소 핀은 항상 표시).
  const mapMarkers = useMemo<NativeMapMarker[]>(() => {
    const placeCount = new Map<string, number>();
    const noteMarkers: NativeMapMarker[] = [];
    for (const n of notes) {
      const loc = n.location ?? n.locations[0];
      if (!loc || !n.path) continue;
      if (mapPeriod) {
        const t = (n.capturedAt ? Date.parse(n.capturedAt) : NaN);
        if (!(t >= mapPeriod.start && t < mapPeriod.end)) continue;
      }
      const host = favoritePlaces.find((p) => distanceM(loc, { lat: p.lat, lng: p.lng }) <= p.radiusM);
      if (host) { placeCount.set(host.id, (placeCount.get(host.id) ?? 0) + 1); continue; }
      const { first, rest } = notePreview(n.body);
      const place = notePlaceName(n, favoritePlaces);
      const when = fmtWhen(n.capturedAt);
      noteMarkers.push({
        id: n.path, lat: loc.lat, lng: loc.lng, title: first, isPlace: false,
        preview: rest.slice(0, 200),
        meta: place ? `${when} · ${place}` : when,
      });
    }
    return [
      ...noteMarkers,
      ...favoritePlaces.map((p) => ({
        id: p.id, lat: p.lat, lng: p.lng, title: p.name,
        emoji: p.emoji, isPlace: true, radiusM: p.radiusM,
        noteCount: placeCount.get(p.id) ?? 0,
      })),
    ];
  }, [notes, favoritePlaces, mapPeriod]);

  // stale closure 방지용 ref
  const selectNoteRef = useRef(selectNote);
  useEffect(() => { selectNoteRef.current = selectNote; });

  useEffect(() => {
    const subs = [
      NativeMap.addListener('markerTapped', ({ id }) => selectNoteRef.current(id)),
      NativeMap.addListener('locationPicked', ({ lat, lng, radiusM }) => {
        if (pickerTargetRef.current === 'note') {
          setDraft((d) => (d ? { ...d, lat: String(lat), lng: String(lng), locManual: true } : d));
          setLocSheet(false);
        } else {
          setPlaceForm((f) => (f ? { ...f, lat, lng, ...(radiusM != null ? { radiusM } : {}) } : null));
        }
      }),
    ];
    return () => {
      subs.forEach((p) => p.then((h) => h.remove()).catch(() => {}));
    };
  }, []);

  // 메모 탭 타임라인 - notes 바뀔 때만 재계산
  const sortedNoteGroups = useMemo(() => {
    const sorted = [...notes].sort(
      (a, b) => new Date(b.capturedAt ?? 0).getTime() - new Date(a.capturedAt ?? 0).getTime()
    );
    const groups: { header: string; items: LocationNote[] }[] = [];
    let lastHeader = '';
    for (const n of sorted) {
      const h = fmtDateHeader(n.capturedAt);
      if (h !== lastHeader) { groups.push({ header: h, items: [] }); lastHeader = h; }
      groups[groups.length - 1]?.items.push(n);
    }
    return groups;
  }, [notes]);

  // 메모 탭 장소별 그룹 — 각 노트를 반경 내 가장 가까운 즐겨찾기 장소에 배정,
  // 그룹은 현재 위치 기준 거리순, 어디에도 안 묶이는 노트는 맨 아래 '그 외'로.
  const placeNoteGroups = useMemo(() => {
    interface PlaceGroup { place: FavoritePlace | null; items: LocationNote[] }
    const byPlace = new Map<string, PlaceGroup>();
    const other: LocationNote[] = [];
    for (const n of notes) {
      const loc = n.location ?? n.locations[0];
      if (!loc) { other.push(n); continue; }
      let best: FavoritePlace | null = null;
      let bestDist = Infinity;
      for (const p of favoritePlaces) {
        const d = distanceM(loc, { lat: p.lat, lng: p.lng });
        if (d <= p.radiusM && d < bestDist) { best = p; bestDist = d; }
      }
      if (best) {
        const g = byPlace.get(best.id) ?? { place: best, items: [] };
        g.items.push(n);
        byPlace.set(best.id, g);
      } else {
        other.push(n);
      }
    }
    const byRecent = (a: LocationNote, b: LocationNote) =>
      new Date(b.capturedAt ?? 0).getTime() - new Date(a.capturedAt ?? 0).getTime();
    const groups = [...byPlace.values()];
    groups.sort((a, b) => {
      if (!myLocation || !a.place || !b.place) return 0;
      return distanceM(myLocation, a.place) - distanceM(myLocation, b.place);
    });
    for (const g of groups) g.items.sort(byRecent);
    if (other.length) {
      other.sort(byRecent);
      groups.push({ place: null, items: other });
    }
    return groups;
  }, [notes, favoritePlaces, myLocation]);

  // 메모 탭 상단 '가까운 메모' — 현재 위치 1km 내 노트를 거리순으로 최대 5개.
  const NEARBY_MEMO_M = 1000;
  const nearbyMemos = useMemo(() => {
    if (!myLocation) return [] as { n: LocationNote; d: number }[];
    return notes
      .flatMap((n) => {
        const loc = n.location ?? n.locations[0];
        if (!loc) return [] as { n: LocationNote; d: number }[];
        const d = distanceM(myLocation, loc);
        return d <= NEARBY_MEMO_M ? [{ n, d }] : [];
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
  }, [notes, myLocation]);
  // 현재 위치 기준 노트 거리 (위치 없으면 undefined)
  const noteDist = (n: LocationNote): number | undefined => {
    const loc = n.location ?? n.locations[0];
    return loc && myLocation ? distanceM(myLocation, loc) : undefined;
  };

  // 메모 검색 — 본문·제목·장소·태그에서 대소문자 무시 부분 일치, 최신순.
  // 공백으로 나눈 단어가 모두 포함돼야 결과에 남는다.
  const searchResults = useMemo(() => {
    const terms = noteQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return null;
    return notes
      .filter((n) => {
        const hay = [n.title ?? '', stripAppendMarks(n.body), notePlaceName(n, favoritePlaces), n.tags.join(' ')]
          .join('\n')
          .toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .sort((a, b) => new Date(b.capturedAt ?? 0).getTime() - new Date(a.capturedAt ?? 0).getTime());
  }, [notes, noteQuery, favoritePlaces]);

  // 크게 보기/편집에서 미리보기로 돌아오면서 '이어서 기록'에 커서를 둔다.
  // iOS는 사용자 탭 핸들러 안에서 동기적으로 focus()해야 키보드가 올라오므로 setState 전에 바로 호출.
  function collapseToAppend() {
    appendInputRef.current?.focus({ preventScroll: true });
    setExistingMode('preview');
  }

  // 본문 첫 줄과 다른(=본문에 없는) frontmatter 제목만 따로 보여준다. 같으면 중복이므로 생략.
  function distinctTitle(d: Draft): string {
    const t = d.title.trim();
    if (!t) return '';
    const first = d.body.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '').trim();
    return first === t ? '' : t;
  }

  // 편집 중인 노트 전체(제목 + 본문 + 이어서 기록)를 구분 마커 없이 복사
  async function copyDraft() {
    if (!draft) return;
    const text = [distinctTitle(draft), stripAppendMarks(draft.body).trim(), draft.appendBody.trim()]
      .filter(Boolean)
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n');
    if (!text) return;
    if (await copyText(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      setError('복사하지 못했습니다.');
    }
  }

  // 즐겨찾기 장소 - 현재 위치 기준 거리순 정렬
  const sortedFavoritePlaces = useMemo(() => {
    if (!myLocation) return favoritePlaces;
    return [...favoritePlaces].sort((a, b) =>
      distanceM(myLocation, { lat: a.lat, lng: a.lng }) - distanceM(myLocation, { lat: b.lat, lng: b.lng })
    );
  }, [favoritePlaces, myLocation]);

  // ── Render ────────────────────────────────────────────
  const indicatorIndex = tab === 'new' ? 0 : tab === 'notes' ? 1 : tab === 'map' ? 2 : 3;
  const isEditingExistingPlace = placeForm ? favoritePlaces.some((p) => p.id === placeForm.id) : false;

  // 메모 리스트 한 줄 — 제목 없이 본문 미리보기 + 시간·장소 라벨. 스와이프 삭제 / 탭 편집.
  // withDate: 날짜 헤더가 없는 목록(장소별·검색)에선 시간에 날짜를 붙인다.
  const renderNoteItem = (n: LocationNote, { showPlace = true, withDate = false } = {}) => {
    const isSel = n.path === selectedPath;
    const { first, rest } = notePreview(n.body);
    const place = showPlace ? notePlaceName(n, favoritePlaces) : '';
    const entries = countEntries(n.body);
    const dist = noteDist(n);
    const when = withDate ? fmtWhen(n.capturedAt) : fmtTime(n.capturedAt);
    return (
      <SwipeToDelete
        key={n.path}
        onDelete={() => scheduleNoteDeletion(n)}
        deleteLabel={`${first} 메모 삭제`}
      >
        <button
          type="button"
          className={`timeline-item${isSel ? ' selected' : ''}`}
          onClick={() => selectNote(n.path as string)}
          aria-label={`${first}, ${when}${place ? `, ${place}` : ''}`}
        >
          <div className="timeline-content">
            {/* 시간 · 장소 라벨 */}
            <div className="timeline-meta">
              <span className="timeline-meta-text">
                {when}
                {place && <> · {place}</>}
                {dist !== undefined && <> · {fmtDist(dist)}</>}
              </span>
              {/* 이어서 기록이 있는 노트는 기록 개수 배지 (오른쪽 끝) */}
              {entries > 1 && <span className="entry-count" aria-label={`이어서 쓴 기록 ${entries}개`}>+{entries - 1}</span>}
            </div>
            {/* 본문 미리보기 */}
            <div className="timeline-preview-first">{first}</div>
            {rest && <div className="timeline-preview-rest">{rest}</div>}
            {n.tags.length > 0 && (
              <div className="timeline-tags" aria-label={`태그 ${n.tags.join(', ')}`}>
                {n.tags.slice(0, 2).map((t) => <span key={t} className="tag">#{t}</span>)}
                {n.tags.length > 2 && <span className="tag tag-more">+{n.tags.length - 2}</span>}
              </div>
            )}
          </div>
        </button>
      </SwipeToDelete>
    );
  };

  const renderNearbyMemoCard = ({ n, d }: { n: LocationNote; d: number }) => {
    const { first, rest } = notePreview(n.body);
    const place = notePlaceName(n, favoritePlaces);
    return (
      <button
        type="button"
        key={n.path}
        className="nearby-memo-card"
        onClick={() => selectNote(n.path as string)}
        aria-label={`가까운 메모, ${first}, ${fmtDist(d)}`}
      >
        <span className="nearby-memo-distance">{fmtDist(d)}</span>
        <strong>{first}</strong>
        {rest && <span className="nearby-memo-preview">{rest}</span>}
        <span className="nearby-memo-place">{place ? `${place} · ${fmtWhen(n.capturedAt)}` : fmtWhen(n.capturedAt)}</span>
      </button>
    );
  };

  return (
    <div className="app">
      {error && <div className="error" onClick={() => setError(null)}>⚠ {error}</div>}
      {pendingDeletion && (
        <div className="undo-toast" role="status" aria-live="polite">
          <span>“{notePreview(pendingDeletion.body).first}” 삭제됨</span>
          <button type="button" onClick={undoNoteDeletion}>실행 취소</button>
        </div>
      )}

      {/* ── 신규: 풀스크린 에디터 ── */}
      {tab === 'new' && draft && (
        <div
          className="fullscreen-editor"
          style={
            keyboardH > 0
              ? { bottom: keyboardH }
              : viewport.h != null
                ? { top: viewport.top, height: viewport.h, bottom: 'auto' }
                : undefined
          }
        >
          <textarea
            ref={newNoteInputRef}
            className="fse-body fse-body-full"
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            onKeyDown={(e) => handleListEnter(e, draft.body, (next) => setDraft({ ...draft, body: next }))}
            placeholder="무슨 생각이든 적어보세요…"
            autoFocus
          />
          {/* 하단 액션바 — 에디터가 키보드 위 영역에 맞춰지므로 흐름상 맨 아래 = 키보드 바로 위 */}
          <div className="compose-bar">
            {/* onPointerDown+preventDefault: 텍스트에어리어 blur(키보드 접힘/레이아웃 점프) 없이
                즉시 동작. 터치·마우스 공통 단일 핸들러라 중복 실행이 없다. */}
            <button
              className="compose-btn compose-cancel"
              onPointerDown={(e) => { e.preventDefault(); closeDraft(); }}
            >취소</button>
            <button
              className="compose-loc"
              onPointerDown={(e) => { e.preventDefault(); openLocSheet(); }}
            >
              {/* 위치 찾는 중(갱신/확인/없음)엔 핀을 숨긴다 — 아직 위치가 없으므로 */}
              {!(!draft.place.trim() && /갱신 중|확인 중|위치 없음/.test(captureLocName)) && (
                <span className="compose-loc-pin">📍</span>
              )}
              <span className="compose-loc-name">{draft.place.trim() || captureLocName}</span>
            </button>
            <button
              className="compose-btn compose-save"
              disabled={!draft.body.trim()}
              onPointerDown={(e) => { e.preventDefault(); if (draft.body.trim()) saveDraft(); }}
            >저장</button>
          </div>
        </div>
      )}

      {/* ── 지도 탭 ── */}
      {tab === 'map' && (
        <MapPane
          markers={mapMarkers}
          active={!draft && !placeForm && !locSheet}
          center={myLocation ?? queryPoint ?? SEOUL}
          onSilentLocate={silentLocate}
          footer={mapBuckets.length >= 2 ? (
            // 슬라이더: 왼쪽 끝 = 가장 예전 구간 … 오른쪽에서 두 번째 = 가장 최근 구간, 오른쪽 끝 = 전체
            <div className="map-period">
              <div className="map-period-row">
                <span className="map-period-label">
                  {mapPeriod ? mapPeriod.label : '전체 기간'}
                  <span className="map-period-count">
                    {' · '}{mapPeriod ? mapPeriod.count : mapBuckets.reduce((s, b) => s + b.count, 0)}개
                  </span>
                </span>
                {mapPeriod && (
                  <button className="link map-period-reset" onClick={() => setMapPeriodKey(null)}>전체 보기</button>
                )}
              </div>
              <input
                type="range"
                className="map-period-slider"
                min={0}
                max={mapBuckets.length}
                step={1}
                value={mapPeriod ? mapBuckets.indexOf(mapPeriod) : mapBuckets.length}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setMapPeriodKey(mapBuckets[i]?.key ?? null);
                }}
                aria-label="지도 기간"
              />
              <div className="map-period-ends">
                <span>예전</span>
                <span>최근 · 전체</span>
              </div>
            </div>
          ) : undefined}
        />
      )}

      {/* ── 메모 탭 (타임라인) ── */}
      {tab === 'notes' && (
        <div className="tab-pane">
          <div className="tab-header note-tab-header">
            <strong>메모</strong>
          </div>
          <div className="note-view-controls" aria-label="메모 정렬 방식">
            <div className="view-seg">
              <button
                className={`view-seg-btn${notesView === 'date' ? ' active' : ''}`}
                onClick={() => setNotesView('date')}
              >날짜</button>
              <button
                className={`view-seg-btn${notesView === 'place' ? ' active' : ''}`}
                onClick={() => setNotesView('place')}
              >장소</button>
            </div>
          </div>
          <div className="note-search">
            <input
              type="search"
              value={noteQuery}
              onChange={(e) => setNoteQuery(e.target.value)}
              placeholder="메모 검색"
              enterKeyHint="search"
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
            {noteQuery && (
              <button className="note-search-clear" onClick={() => setNoteQuery('')} aria-label="검색어 지우기">✕</button>
            )}
          </div>
          <div className="timeline">
            {notesLoading && (
              <div className="timeline-empty">
                <p className="muted">노트를 불러오는 중…</p>
              </div>
            )}
            {!notesLoading && notes.length === 0 && (
              <div className="timeline-empty">
                <p className="muted">아직 메모가 없습니다.</p>
                {source.kind === 'none' && <p className="muted small">설정에서 폴더를 연결하세요.</p>}
              </div>
            )}
            {/* 검색 중이면 검색 결과만 최신순으로 */}
            {searchResults && (
              <div className="timeline-group">
                <div className="timeline-date-header">
                  검색 결과<span className="muted small"> · {searchResults.length}개</span>
                </div>
                {searchResults.length === 0 && (
                  <div className="timeline-empty"><p className="muted">일치하는 메모가 없습니다.</p></div>
                )}
                {searchResults.map((n) => renderNoteItem(n, { withDate: true }))}
              </div>
            )}
            {/* 가까운 메모 바로가기 — 날짜 보기 상단 가로 카드. 목록에서는 빼지 않는다
                (빼면 집처럼 자주 쓰는 곳의 메모가 날짜 목록에서 사라져 보인다).
                장소 보기는 이미 거리순 그룹이라 생략. */}
            {!searchResults && !notesLoading && notesView === 'date' && nearbyMemos.length > 0 && (
              <section className="nearby-memo-section" aria-labelledby="nearby-memo-title">
                <div className="nearby-memo-heading">
                  <strong id="nearby-memo-title">내 주변</strong>
                  <span>{NEARBY_MEMO_M / 1000}km 이내 · 가까운 순</span>
                </div>
                <div className="nearby-memo-scroll">
                  {nearbyMemos.map(renderNearbyMemoCard)}
                </div>
              </section>
            )}
            {/* 날짜별 보기 */}
            {!searchResults && notesView === 'date' && sortedNoteGroups.map((g) => (
              <div key={g.header} className="timeline-group">
                <div className="timeline-date-header">{g.header}</div>
                {g.items.map((n) => renderNoteItem(n))}
              </div>
            ))}
            {/* 장소별 보기 (거리순) */}
            {!searchResults && notesView === 'place' && placeNoteGroups.map((g) => {
              const items = g.items;
              const gid = g.place ? g.place.id : '__other__';
              const gdist = g.place && myLocation
                ? distanceM(myLocation, { lat: g.place.lat, lng: g.place.lng })
                : null;
              return (
                <div key={gid} className="timeline-group">
                  <div className="timeline-date-header">
                    {g.place
                      ? <>{g.place.emoji ? `${g.place.emoji} ` : ''}{g.place.name}</>
                      : '그 외'}
                    {gdist !== null && <span className="muted small"> · {fmtDist(gdist)}</span>}
                    <span className="muted small"> · {items.length}개</span>
                  </div>
                  {items.map((n) => renderNoteItem(n, { showPlace: false, withDate: true }))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 설정 탭 ── */}
      {tab === 'settings' && (
        <div className="tab-pane">
          <div className="tab-header">
            <strong>설정</strong>
          </div>
          <div className="settings-body">
            <div className="settings-section">
              <div className="settings-label">보관함</div>
              {source.kind === 'folder' ? (
                <div className="vault-row">
                  <span className="vault-icon">📁</span>
                  <div className="vault-info">
                    <span className="vault-name">{source.name}</span>
                    <span className="vault-count">{notes.length}개 노트</span>
                  </div>
                  <div className="vault-actions">
                    <button className="vault-btn" disabled={placesBusy} onClick={() => refresh(true)} title="새로고침">↻</button>
                    {isVaultSupported() && <button className="vault-btn" disabled={placesBusy} onClick={openFolder}>변경</button>}
                  </div>
                </div>
              ) : (
                <div className="vault-row vault-row-empty">
                  {isVaultSupported() ? (
                    <button className="primary" disabled={placesBusy} onClick={openFolder} style={{ width: '100%' }}>폴더 연결</button>
                  ) : (
                    <p className="muted small">이 브라우저는 폴더 열기를 지원하지 않습니다.</p>
                  )}
                </div>
              )}
            </div>

            <div className="settings-section">
              <div className="settings-label">즐겨찾기 장소</div>
              <p className="muted small" style={{ margin: '0 0 8px' }}>
                {placesBusy ? '즐겨찾기를 저장하거나 불러오는 중…'
                  : source.kind === 'folder'
                    ? placesReady
                      ? '연결한 폴더에 저장됩니다. 재설치 후 같은 폴더를 연결하면 복원됩니다.'
                      : '즐겨찾기를 불러오지 못했습니다. 보관함의 새로고침 버튼으로 다시 시도하세요.'
                    : '현재 이 앱에만 저장됩니다. 폴더를 연결하면 즐겨찾기도 함께 보관됩니다.'}
              </p>
              {favoritePlaces.length === 0 && (
                <p className="muted small" style={{ margin: '0 0 8px' }}>
                  자주 가는 장소를 등록하면, 해당 반경 내에서 작성한 노트에 태그가 자동으로 붙습니다.
                </p>
              )}
              {sortedFavoritePlaces.map((p) => {
                const dist = myLocation ? distanceM(myLocation, { lat: p.lat, lng: p.lng }) : null;
                const inside = dist !== null && dist <= p.radiusM;
                return (
                  <SwipeToDelete
                    key={p.id}
                    onDelete={() => deletePlace(p.id)}
                    deleteLabel={`${p.name} 장소 삭제`}
                  >
                    <div
                      className={`settings-place-row${inside ? ' inside' : ''}`}
                      onClick={() => startEditPlace(p)}
                      style={{ cursor: 'pointer', marginBottom: 0 }}
                    >
                      <div className="settings-place-info">
                        <div className="settings-place-name">
                          {p.emoji ? <span style={{ marginRight: 6 }}>{p.emoji}</span> : null}
                          {p.name}
                        </div>
                        <div className="settings-place-meta">
                          반경 {p.radiusM < 1000 ? `${p.radiusM}m` : `${(p.radiusM / 1000).toFixed(1)}km`}
                          {' · '}#{placeEffectiveTag(p)}
                          {inside && <span className="settings-place-inside"> ● 현재 위치</span>}
                          {dist !== null && !inside && <span className="muted"> · {fmtDist(dist)}</span>}
                        </div>
                      </div>
                    </div>
                  </SwipeToDelete>
                );
              })}
              <button disabled={placesBusy || !placesReady} onClick={startAddPlace} style={{ marginTop: 4 }}>＋ 장소 추가</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 기존 노트 전체화면 편집 ── */}
      {tab !== 'new' && draft && (
        <div
          className={`fullscreen-editor note-editor${existingMode !== 'preview' ? ' existing-expanded' : ''}${keyboardH > 0 ? ' kb-open' : ''}`}
          // 신규 에디터와 같은 방식으로 키보드 위 영역에 맞춘다 — 이어서 기록 입력칸이 키보드에 가려지지 않게
          style={
            keyboardH > 0
              ? { bottom: keyboardH }
              : viewport.h != null
                ? { top: viewport.top, height: viewport.h, bottom: 'auto' }
                : undefined
          }
        >
          <div className="fse-header">
            <button className="link fse-cancel" onPointerDown={(e) => { e.preventDefault(); closeDraft(); }}>닫기</button>
            <span className="note-edit-title">
              {distinctTitle(draft)
                || (draft.base?.capturedAt ? `${fmtDateHeader(draft.base.capturedAt)} ${fmtTime(draft.base.capturedAt)}` : '메모')}
            </span>
            <div className="fse-actions">
              {/* 클립보드 쓰기는 user activation이 필요한데 터치의 pointerdown은 activation이 아니다.
                  pointerdown에선 blur(키보드 접힘)만 막고, 복사는 activation이 있는 click에서 실행. */}
              <button
                className="link fse-copy"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => { void copyDraft(); }}
              >
                {copied ? '복사됨' : '복사'}
              </button>
              <button className="fse-save" onPointerDown={(e) => { e.preventDefault(); saveDraft(); }}>저장</button>
            </div>
          </div>
          {/* 기존 본문 — 기본은 읽기 전용 미리보기. 탭하면 크게 펼쳐 읽기, '편집'을 눌러야 수정. */}
          <div className="note-existing-wrap">
            {existingMode === 'edit' ? (
              <textarea
                className="note-edit-existing"
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                onKeyDown={(e) => handleListEnter(e, draft.body, (next) => setDraft({ ...draft, body: next }))}
                placeholder="내용을 입력하세요"
                autoFocus
              />
            ) : (
              <div
                className="note-read"
                onClick={() => {
                  if (existingMode === 'read') {
                    collapseToAppend();
                  } else {
                    // 크게 읽을 땐 키보드를 내려 펼친 영역이 보이게 한다
                    (document.activeElement as HTMLElement | null)?.blur();
                    setExistingMode('read');
                  }
                }}
              >
                <NoteReadView body={draft.body} />
              </div>
            )}
            <div className="note-existing-actions">
              {existingMode === 'read' && (
                <button className="link small" onClick={collapseToAppend}>접기</button>
              )}
              <button
                className="link small"
                onClick={() => (existingMode === 'edit' ? collapseToAppend() : setExistingMode('edit'))}
              >{existingMode === 'edit' ? '완료' : '편집'}</button>
            </div>
          </div>
          {/* 이어서 기록 구분선 */}
          <div className="note-edit-divider">
            <span className="note-edit-time">{fmtAppendStamp(new Date())}</span>
          </div>
          {/* 추가 기록 */}
          <textarea
            ref={appendInputRef}
            className="note-edit-append"
            value={draft.appendBody}
            onChange={(e) => setDraft({ ...draft, appendBody: e.target.value })}
            onKeyDown={(e) => handleListEnter(e, draft.appendBody, (next) => setDraft({ ...draft, appendBody: next }))}
            placeholder="이어서 기록…"
            autoFocus
          />
          {/* 위치 변경 */}
          <div className="note-edit-loc">
            <div className="note-edit-loc-info">
              <span className="note-edit-loc-icon">📍</span>
              <span className="muted small">
                {(() => {
                  const la = Number(draft.lat), ln = Number(draft.lng);
                  return Number.isFinite(la) && Number.isFinite(ln)
                    ? `${la.toFixed(5)}, ${ln.toFixed(5)}`
                    : '위치 없음';
                })()}
                {draft.place.trim() && <span> · {draft.place.trim()}</span>}
                {(draft.lat !== draft._initLat || draft.lng !== draft._initLng) && (
                  <span className="note-edit-loc-changed"> · 변경됨</span>
                )}
              </span>
            </div>
            <div className="place-loc-btns">
              <button className="loc-btn" onClick={openLocSheet}>위치 변경 · 검색</button>
            </div>
          </div>
          <button className="note-delete-link" onClick={deleteCurrentNote}>노트 삭제</button>
        </div>
      )}

      {/* ── 노트 위치 조정 시트 (검색/현재위치/지도) ── */}
      {locSheet && draft && (
        <div
          className={`editor-overlay${keyboardH > 0 ? ' kb-open' : ''}`}
          style={sheetOverlayStyle}
          onClick={(e) => e.target === e.currentTarget && closeLocSheet()}
        >
          <div className="editor-sheet">
            <div className="editor-handle" />
            <div className="editor-inner">
              <div className="row">
                <strong>위치 지정</strong>
                <button className="link" onClick={closeLocSheet}>닫기</button>
              </div>
              <div className="place-search-row">
                <input
                  value={placeSearch}
                  onChange={(e) => setPlaceSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchPlaceName()}
                  placeholder="장소 검색 (예: 스타벅스 강남)"
                  autoFocus
                />
                <button className="loc-btn" onClick={searchPlaceName} disabled={placeSearching}>
                  {placeSearching ? '…' : '검색'}
                </button>
              </div>
              {placeSearchResults.length > 0 && (
                <ul className="place-search-results">
                  {placeSearchResults.map((r, i) => (
                    <li key={i} onClick={() => pickSearchedForNote(r)}>
                      {r.name.length > 55 ? r.name.slice(0, 55) + '…' : r.name}
                    </li>
                  ))}
                </ul>
              )}
              <div className="place-loc-btns">
                <button className="loc-btn" onClick={useCurrentLocForNote} disabled={locating}>📍 현재 위치</button>
                <button className="loc-btn" onClick={openNoteLocationPicker}>🗺️ 지도에서 선택</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 장소 추가/편집 (풀스크린) ── */}
      {placeForm && (
        <div className="fullscreen-editor place-page">
          <div className="fse-header">
            <button className="link fse-cancel" disabled={placesBusy} onClick={cancelPlaceForm}>취소</button>
            <span className="fse-title">{isEditingExistingPlace ? '장소 편집' : '장소 추가'}</span>
            <button className="fse-save" disabled={placesBusy || !placesReady} onClick={savePlaceForm}>저장</button>
          </div>
          {/* 화면 크기는 고정, 키보드 높이만큼 하단 여백만 늘려 스크롤로 입력칸을 보이게 한다 */}
          <div className="editor-inner" style={keyboardH > 0 ? { paddingBottom: keyboardH + 16 } : undefined}>

            {/* 장소 검색 */}
            <div className="place-search-row">
              <input
                value={placeSearch}
                onChange={(e) => setPlaceSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchPlaceName()}
                placeholder="장소 검색..."
              />
              <button className="loc-btn" onClick={searchPlaceName} disabled={placeSearching}>
                {placeSearching ? '…' : '검색'}
              </button>
            </div>
            {placeSearchResults.length > 0 && (
              <ul className="place-search-results">
                {placeSearchResults.map((r, i) => (
                  <li key={i} onClick={() => {
                    const updated = { ...placeForm, lat: r.lat, lng: r.lng };
                    setPlaceForm(updated);
                    setPlaceSearchResults([]);
                    setPlaceSearch('');
                    NativeMap.showPicker({ lat: r.lat, lng: r.lng, radiusM: updated.radiusM }).catch(() => {});
                  }}>
                    {r.name.length > 55 ? r.name.slice(0, 55) + '…' : r.name}
                  </li>
                ))}
              </ul>
            )}

            {/* 아이콘 */}
            <label>
              아이콘 <span style={{ color: 'var(--muted)', fontSize: 11 }}>(선택 · 이모지 키보드로 입력)</span>
              <input
                className="emoji-input"
                value={placeForm.emoji}
                onChange={(e) => {
                  const chars = [...e.target.value];
                  setPlaceForm({ ...placeForm, emoji: chars.slice(0, 2).join('') });
                }}
                placeholder="😀"
                inputMode="text"
                autoCorrect="off"
                autoCapitalize="none"
              />
            </label>

            {/* 장소 이름 */}
            <label>
              장소 이름
              <input
                value={placeForm.name}
                onChange={(e) => setPlaceForm({ ...placeForm, name: e.target.value })}
                placeholder="예: 집, 회사, 카페"
                autoFocus={!isEditingExistingPlace}
              />
            </label>

            {/* 태그 */}
            <label>
              태그 (비워두면 이름으로 자동 생성)
              <input
                value={placeForm.tag}
                onChange={(e) => setPlaceForm({ ...placeForm, tag: e.target.value })}
                placeholder={placeForm.name ? placeForm.name.toLowerCase().replace(/\s+/g, '-') : 'home'}
              />
            </label>

            {/* 위치 + 반경 */}
            <div>
              <p className="muted small" style={{ margin: '0 0 8px' }}>
                {placeForm.lat.toFixed(5)}, {placeForm.lng.toFixed(5)}
                {' · 반경 '}
                {placeForm.radiusM < 1000 ? `${placeForm.radiusM}m` : `${(placeForm.radiusM / 1000).toFixed(1)}km`}
              </p>
              <div className="place-loc-btns">
                <button className="loc-btn" onClick={useCurrentLocForPlace} disabled={locating}>
                  현재 위치
                </button>
                <button className="loc-btn" onClick={() => openNativePicker()}>
                  지도에서 선택 · 반경 조정
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 하단 내비게이션 ── */}
      {tab !== 'new' && !draft && (
        <div className="nav-bar-wrap">
          <nav className="bottom-nav">
            <div
              className="nav-indicator"
              style={{ '--i': indicatorIndex } as React.CSSProperties}
            />
            <button
              className="nav-item nav-item-new"
              onClick={() => { setTab('new'); newNote(); }}
            >
              <IconCompose />
              <span>신규</span>
            </button>
            <button className={`nav-item${tab === 'notes' ? ' active' : ''}`} onClick={() => setTab('notes')}>
              <IconNote />
              <span>메모</span>
            </button>
            <button className={`nav-item${tab === 'map' ? ' active' : ''}`} onClick={() => setTab('map')}>
              <IconMap />
              <span>지도</span>
            </button>
            <button className={`nav-item${tab === 'settings' ? ' active' : ''}`} onClick={() => setTab('settings')}>
              <IconSettings />
              <span>설정</span>
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
