/** jsdom 环境下 CM6 EditorView 需要的最小 polyfill */

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
}
