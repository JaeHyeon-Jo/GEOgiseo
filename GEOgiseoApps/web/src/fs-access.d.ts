/**
 * File System Access API 최소 타입 선언.
 * 표준 lib.dom에 아직 포함되지 않은 부분(showDirectoryPicker, 디렉터리 순회)만 보강한다.
 */
interface FileSystemDirectoryHandleEntries {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandle & FileSystemDirectoryHandleEntries>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemFileHandle>;
}

interface Window {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<FileSystemDirectoryHandle & FileSystemDirectoryHandleEntries>;
}
