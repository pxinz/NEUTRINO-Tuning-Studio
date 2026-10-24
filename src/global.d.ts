declare global {
  interface Window {
    api: import('./lib/types').PreloadApi;
  }
}

export {};
