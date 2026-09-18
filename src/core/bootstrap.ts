import { registerServiceWorker } from "../infrastructure/pwa/registerServiceWorker";
import { AppRuntime } from "./AppRuntime";

export async function bootstrap(root: HTMLElement): Promise<void> {
  const runtime = new AppRuntime(root);
  runtime.start();
  await registerServiceWorker();

  if (import.meta.hot) {
    import.meta.hot.dispose(() => runtime.stop());
  }
}
