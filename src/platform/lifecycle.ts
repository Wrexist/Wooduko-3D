/**
 * App lifecycle adapter: fires when the app goes to the background or comes back.
 * Web uses the Page Visibility API; phase 7 adds `@capacitor/app` state events.
 */
export function onLifecycle(handlers: { background: () => void; foreground: () => void }): () => void {
  const onVis = (): void => {
    if (document.visibilityState === 'hidden') handlers.background();
    else handlers.foreground();
  };
  const onHide = (): void => handlers.background();
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', onHide);
  return () => {
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', onHide);
  };
}
