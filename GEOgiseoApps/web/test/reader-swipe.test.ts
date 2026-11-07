import { describe, expect, it } from 'vitest';
import { isReaderBackSwipe, startReaderSwipe } from '../src/reader-swipe.js';

const touch = (identifier: number, clientX: number, clientY: number) => ({ identifier, clientX, clientY });
const touches = (...items: ReturnType<typeof touch>[]) => items as unknown as TouchList;

describe('문서 뒤로가기 제스처', () => {
  it('왼쪽 가장자리에서 시작한 충분한 오른쪽 이동만 인정한다', () => {
    const start = startReaderSwipe(touches(touch(1, 20, 100)))!;
    expect(isReaderBackSwipe(start, touch(1, 110, 110))).toBe(true);
    expect(isReaderBackSwipe(start, touch(1, 90, 100))).toBe(false);
    expect(isReaderBackSwipe(start, touch(1, 110, 180))).toBe(false);
    expect(isReaderBackSwipe(start, touch(1, 0, 100))).toBe(false);
    expect(isReaderBackSwipe(start, touch(2, 110, 100))).toBe(false);
    expect(startReaderSwipe(touches(touch(1, 50, 100)))).toBeNull();
    expect(startReaderSwipe(touches(touch(1, 10, 100), touch(2, 20, 100)))).toBeNull();
  });
});
