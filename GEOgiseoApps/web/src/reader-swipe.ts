const EDGE_WIDTH = 36;
const MIN_DISTANCE = 80;

export type SwipeStart = { id: number; x: number; y: number };

export function startReaderSwipe(touches: ArrayLike<Pick<Touch, 'identifier' | 'clientX' | 'clientY'>>): SwipeStart | null {
  const touch = touches[0];
  if (touches.length !== 1 || !touch || touch.clientX > EDGE_WIDTH) return null;
  return { id: touch.identifier, x: touch.clientX, y: touch.clientY };
}

export function isReaderBackSwipe(start: SwipeStart, touch: Pick<Touch, 'identifier' | 'clientX' | 'clientY'>): boolean {
  const dx = touch.clientX - start.x;
  const dy = Math.abs(touch.clientY - start.y);
  return touch.identifier === start.id && dx >= MIN_DISTANCE && dx > dy * 1.5;
}
