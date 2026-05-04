"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Encode a value into a URL-safe base64 string of its JSON representation.
 * Replaces `+` -> `-`, `/` -> `_`, strips trailing `=`.
 */
function encode<T>(value: T): string {
  const json = JSON.stringify(value);
  // btoa handles latin-1; to support unicode safely, escape first.
  const b64 =
    typeof window === "undefined"
      ? Buffer.from(json, "utf8").toString("base64")
      : btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decode a URL-safe base64 string back into a JSON value of type T.
 * Returns `undefined` if decoding/parsing fails.
 */
function decode<T>(raw: string): T | undefined {
  try {
    let b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const json =
      typeof window === "undefined"
        ? Buffer.from(b64, "base64").toString("utf8")
        : decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

/**
 * useUrlState — like useState, but the value is mirrored to a query-string param.
 *
 * - On mount, reads `?<key>=<base64>`; if present and decodable, that becomes the
 *   initial value. Otherwise falls back to `defaultValue`.
 * - The setter writes the new value back to the URL via `router.replace`,
 *   preserving every other existing search param. No full navigation.
 * - The encoded value is JSON.stringify -> URL-safe base64 -> encodeURIComponent.
 *
 * Note: this hook is the source of truth for the value. We intentionally do NOT
 * reconcile back from `searchParams` after mount, to avoid render loops when
 * multiple `useUrlState` calls coexist on the same page.
 */
export function useUrlState<T>(
  key: string,
  defaultValue: T
): [T, (next: T | ((prev: T) => T)) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [value, setValueState] = useState<T>(() => {
    const raw = searchParams?.get(key);
    if (raw == null) return defaultValue;
    const decoded = decode<T>(raw);
    return decoded === undefined ? defaultValue : decoded;
  });

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValueState((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;

        // Build params from the live URL (read fresh, so we don't clobber
        // params updated by other hooks since the last render).
        const liveSearch =
          typeof window !== "undefined" ? window.location.search : "";
        const params = new URLSearchParams(liveSearch);
        const encoded = encodeURIComponent(encode(resolved));
        params.set(key, encoded);

        const qs = params.toString();
        const path = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");
        router.replace(qs ? `${path}?${qs}` : path, { scroll: false });

        return resolved;
      });
    },
    [key, pathname, router]
  );

  return [value, setValue];
}
