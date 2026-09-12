// Ambient types for the parts of the File System Access API not yet in the
// standard TypeScript DOM lib. `showDirectoryPicker` and `FileSystemHandle`
// themselves are already declared; only the permission methods (still a
// separate proposal) are missing. See:
// https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
export {};

interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: FileSystemHandle | string;
}

declare global {
  interface FileSystemHandle {
    queryPermission?(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>;
    requestPermission?(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>;
  }

  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<
      FileSystemDirectoryHandle | FileSystemFileHandle
    >;
  }

  interface Window {
    showDirectoryPicker(
      options?: DirectoryPickerOptions,
    ): Promise<FileSystemDirectoryHandle>;
  }
}
