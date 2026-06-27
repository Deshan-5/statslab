import { useState, useCallback, useRef, useEffect } from "react";

export function useWorker<TRequest, TResponse>() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Instantiate worker exactly once per hook lifecycle
    workerRef.current = new Worker(new URL("../workers/stats.worker", import.meta.url));

    workerRef.current.onmessage = (e) => {
      if (e.data.type === "SUCCESS") {
        setResult(e.data.result);
        setLoading(false);
      } else if (e.data.type === "ERROR") {
        setError(e.data.error);
        setLoading(false);
      }
    };

    workerRef.current.onerror = (err) => {
      setError(err.message || "Worker initialization error");
      setLoading(false);
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback((type: string, payload: TRequest) => {
    setLoading(true);
    setError(null);
    workerRef.current?.postMessage({ type, payload });
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
  }, []);

  return { run, loading, result, error, clearResult };
}
