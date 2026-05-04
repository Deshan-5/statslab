/**
 * Workspace dataset store: a single dataset shared across every tool.
 *
 * Tools read columns by name (via useWorkspaceColumn), pickers list
 * available numeric/categorical columns, and brushing tools push selected
 * row indices into the shared selection set so other views can highlight.
 */

export type ColumnType = "numeric" | "categorical";

export type Column = {
  name: string;
  index: number;
  type: ColumnType;
  values: (number | string | null)[];
  numeric: number[];          // numeric values with NaN/null filtered out
  numericIndex: number[];     // row index for each entry in `numeric`
};

export type Dataset = {
  id: string;
  name: string;
  source: "example" | "csv" | "paste";
  headers: string[];
  rows: (number | string | null)[][];
  columns: Column[];
};

export type ExampleDataset = {
  id: string;
  name: string;
  description: string;
  source: string;
  build: () => { headers: string[]; rows: (number | string)[][] };
};

export function buildDataset(
  id: string,
  name: string,
  source: Dataset["source"],
  headers: string[],
  rows: (number | string | null)[][]
): Dataset {
  const columns: Column[] = headers.map((h, idx) => {
    const values = rows.map((r) => r[idx] ?? null);
    const numeric: number[] = [];
    const numericIndex: number[] = [];
    let numCount = 0, nonNullCount = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v === null || v === "") continue;
      nonNullCount++;
      const n = typeof v === "number" ? v : Number(v);
      if (!isNaN(n)) {
        numeric.push(n);
        numericIndex.push(i);
        numCount++;
      }
    }
    const type: ColumnType =
      nonNullCount > 0 && numCount / nonNullCount > 0.7 ? "numeric" : "categorical";
    return { name: h, index: idx, type, values, numeric, numericIndex };
  });
  return { id, name, source, headers, rows, columns };
}

const STORAGE_KEY = "statslab.workspace.v1";

type StoredState = {
  datasetId: string | null;
  datasetSource: "example" | null;
  // For pasted/csv data we re-serialize:
  pastedHeaders?: string[];
  pastedRows?: (number | string | null)[][];
  pastedName?: string;
};

export function saveToStorage(s: StoredState) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

export function loadFromStorage(): StoredState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredState;
  } catch { return null; }
}

export function clearStorage() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
}
