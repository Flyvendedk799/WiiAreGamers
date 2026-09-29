declare module '@cycjimmy/jsmpeg-player' {
  const JSMpeg: {
    VideoElement: new (
      element: string | HTMLElement,
      url: string,
      options?: Record<string, unknown>,
      overlayOptions?: Record<string, unknown>
    ) => {
      destroy: () => void
      player?: {
        volume?: number
        audioOut?: {
          unlock?: () => void
          context?: { state?: string; resume: () => void }
        }
      }
      onUnlockAudio?: (el: unknown, event: unknown) => void
      els?: { wrapper?: unknown }
      mjpegWs?: WebSocket
    }
  }
  export default JSMpeg
}
