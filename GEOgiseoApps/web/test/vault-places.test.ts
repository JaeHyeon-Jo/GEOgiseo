import { describe, expect, it, vi } from 'vitest';
import { readPlaces, writePlaces } from '../src/vault-fs.js';
import { PLACES_FILE } from '../src/places.js';

type Directory = Parameters<typeof readPlaces>[0];

function directory(getFileHandle: ReturnType<typeof vi.fn>): Directory {
  return { getFileHandle } as unknown as Directory;
}

describe('웹 보관함 즐겨찾기 파일', () => {
  it('정확한 파일 이름으로 읽고 파일이 없을 때만 null을 반환한다', async () => {
    const getFileHandle = vi.fn().mockRejectedValue(Object.assign(new Error('없음'), { name: 'NotFoundError' }));
    expect(await readPlaces(directory(getFileHandle))).toBeNull();
    expect(getFileHandle).toHaveBeenCalledWith(PLACES_FILE);
    getFileHandle.mockRejectedValue(Object.assign(new Error('권한 없음'), { name: 'NotAllowedError' }));
    await expect(readPlaces(directory(getFileHandle))).rejects.toThrow('권한 없음');
  });

  it('파일 핸들을 얻은 후 다운로드가 실패하면 오류를 전달한다', async () => {
    const getFileHandle = vi.fn().mockResolvedValue({ getFile: vi.fn().mockRejectedValue(new Error('다운로드 실패')) });
    await expect(readPlaces(directory(getFileHandle))).rejects.toThrow('다운로드 실패');
  });

  it('정상 파일 내용을 반환하고 큰 파일은 읽지 않는다', async () => {
    const file = { size: 10, text: vi.fn().mockResolvedValue('내용') };
    const getFileHandle = vi.fn().mockResolvedValue({ getFile: vi.fn().mockResolvedValue(file) });
    expect(await readPlaces(directory(getFileHandle))).toBe('내용');
    file.size = 1024 * 1024 + 1;
    await expect(readPlaces(directory(getFileHandle))).rejects.toThrow('1MB');
    expect(file.text).toHaveBeenCalledTimes(1);
  });

  it('쓰기 완료 전 실패하면 스트림을 중단하고 오류를 전달한다', async () => {
    const stream = {
      write: vi.fn().mockRejectedValue(new Error('저장 실패')),
      close: vi.fn(), abort: vi.fn().mockResolvedValue(undefined),
    };
    const getFileHandle = vi.fn().mockResolvedValue({ createWritable: vi.fn().mockResolvedValue(stream) });
    await expect(writePlaces(directory(getFileHandle), '내용')).rejects.toThrow('저장 실패');
    expect(stream.close).not.toHaveBeenCalled();
    expect(stream.abort).toHaveBeenCalledOnce();
  });

  it('고정 파일에 내용을 쓰고 스트림을 닫는다', async () => {
    const stream = { write: vi.fn(), close: vi.fn(), abort: vi.fn() };
    const getFileHandle = vi.fn().mockResolvedValue({ createWritable: vi.fn().mockResolvedValue(stream) });
    await writePlaces(directory(getFileHandle), '내용');
    expect(getFileHandle).toHaveBeenCalledWith(PLACES_FILE, { create: true });
    expect(stream.write).toHaveBeenCalledWith('내용');
    expect(stream.close).toHaveBeenCalledOnce();
    expect(stream.abort).not.toHaveBeenCalled();
  });
});
