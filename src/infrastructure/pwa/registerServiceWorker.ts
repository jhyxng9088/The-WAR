export async function registerServiceWorker(): Promise<void> {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  const serviceWorkerUrl = new URL(
    import.meta.env.BASE_URL + "sw.js",
    window.location.origin,
  );

  try {
    await navigator.serviceWorker.register(serviceWorkerUrl.href, {
      scope: import.meta.env.BASE_URL,
    });
  } catch (error) {
    console.warn("THE WAR service worker registration failed.", error);
  }
}
