import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickReadingFolder } from '../src/reading-folder.js';

function file(name: string, content: string, size = content.length) {
  return [name, { kind: 'file', getFile: async () => ({ size, text: async () => content }) }] as const;
}
function dir(name: string, entries: readonly (readonly [string, unknown])[]) {
  return { kind: 'directory', name, async *entries() { yield* entries; } };
}

describe('읽기 폴더', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('읽기 권한으로 선택하고 하위 Markdown 문서만 읽으며 실패한 파일을 알린다', async () => {
    const sub = dir('Weekly', [file('2026-W45.md', '# 이번 주'), file('large.md', '', 6 * 1024 * 1024)]);
    const root = dir('정리', [['Weekly', sub], file('관심사.md', '관심'), file('image.png', 'x'), file('.hidden.md', 'x')]);
    const picker = vi.fn(async () => root);
    vi.stubGlobal('window', { showDirectoryPicker: picker });
    const folder = await pickReadingFolder();
    expect(picker).toHaveBeenCalledWith({ mode: 'read' });
    expect(folder.name).toBe('정리');
    expect(await folder.read()).toEqual({
      documents: [{ path: 'Weekly/2026-W45.md', content: '# 이번 주' }, { path: '관심사.md', content: '관심' }], skipped: 1,
    });
  });
  it('폴더 순회 권한 오류를 빈 목록으로 숨기지 않는다', async () => {
    const root = { name: '정리', async *entries() { throw new Error('권한 없음'); } };
    vi.stubGlobal('window', { showDirectoryPicker: async () => root });
    const folder = await pickReadingFolder();
    await expect(folder.read()).rejects.toThrow('권한 없음');
  });
  it('저장 전에 기존 본문을 비교하고 충돌하면 쓰기를 취소한다', async () => {
    let current = '### 주제\n';
    const abort = vi.fn(async () => {});
    const handle = { kind: 'file', getFile: async () => ({ size: current.length, text: async () => current }),
      createWritable: async () => ({ write: async (value: string) => { current = value; }, close: async () => {}, abort }) };
    const root = { ...dir('Weekly', [['2026-W45.md', handle]]), requestPermission: async () => 'granted', getFileHandle: async () => handle };
    vi.stubGlobal('window', { showDirectoryPicker: async () => root });
    const folder = await pickReadingFolder();
    await folder.replaceWeekly('2026-W45.md', current, '### 주제 ⭐\n');
    expect(current).toBe('### 주제 ⭐\n');
    await expect(folder.replaceWeekly('2026-W45.md', '오래된 본문', '덮어쓰기')).rejects.toThrow('변경되었어요');
    expect(abort).toHaveBeenCalledOnce();
    expect(current).toBe('### 주제 ⭐\n');
    await expect(folder.replaceWeekly('../2026-W45.md', current, '')).rejects.toThrow();
  });
});
