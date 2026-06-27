/**
 * Centralized, typed event bus for Stats Lab.
 * Replaces direct window.dispatchEvent calls with structured, centralized events.
 */

type StatsLabEvents = {
  "statslab:ask-tutor": { prompt: string };
  "statslab:tutor-send-prompt": { prompt: string };
  "statslab:set-input": { param: string; value: any };
  "statslab:set-tool-state": { targetToolId: string; param: string; value: any };
  // Emitted by heavy tools (Bootstrap, Monte Carlo, CLT…) to show a live indicator in the header
  "statslab:computing": { label: string; done?: boolean };
  "statslab:param-changed": { toolId: string; param: string; value: any; oldValue: any };
};

export const eventBus = {
  emit<K extends keyof StatsLabEvents>(event: K, detail: StatsLabEvents[K]) {
    if (typeof window === "undefined") return;
    const ev = new CustomEvent(event, { detail });
    window.dispatchEvent(ev);
  },

  on<K extends keyof StatsLabEvents>(
    event: K,
    callback: (detail: StatsLabEvents[K]) => void
  ) {
    if (typeof window === "undefined") return () => {};
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<StatsLabEvents[K]>;
      callback(customEvent.detail || ({} as any));
    };
    window.addEventListener(event, handler);
    return () => {
      window.removeEventListener(event, handler);
    };
  },
};
