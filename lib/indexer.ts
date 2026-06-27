import type { Dataset } from "./dataset";
import type { Filter } from "@/components/workspace/WorkspaceProvider";

export class BitMap {
  public words: Uint32Array;
  public size: number;

  constructor(size: number) {
    this.size = size;
    // Each 32-bit integer holds 32 flags
    this.words = new Uint32Array(Math.ceil(size / 32));
  }

  set(index: number) {
    const wordIdx = Math.floor(index / 32);
    const bitIdx = index % 32;
    this.words[wordIdx] |= (1 << bitIdx);
  }

  get(index: number): boolean {
    const wordIdx = Math.floor(index / 32);
    const bitIdx = index % 32;
    return (this.words[wordIdx] & (1 << bitIdx)) !== 0;
  }

  static and(a: BitMap, b: BitMap): BitMap {
    const result = new BitMap(a.size);
    for (let i = 0; i < a.words.length; i++) {
      result.words[i] = a.words[i] & b.words[i];
    }
    return result;
  }

  static not(a: BitMap): BitMap {
    const result = new BitMap(a.size);
    for (let i = 0; i < a.words.length; i++) {
      result.words[i] = ~a.words[i];
    }
    return result;
  }
}

export class TableIndex {
  private size: number;
  // O(1) categorical lookups via bitsets
  private categoricalIndexes: Record<string, Record<string, BitMap>> = {};
  // Contiguous memory Float64 arrays for ultra-fast CPU cache numeric scans
  private numericColumns: Record<string, Float64Array> = {};

  constructor(dataset: Dataset) {
    this.size = dataset.rows.length;
    
    // Initialize storage spaces
    dataset.headers.forEach((h, colIdx) => {
      const col = dataset.columns[colIdx];
      if (col.type === "categorical") {
        this.categoricalIndexes[h] = {};
      } else {
        this.numericColumns[h] = new Float64Array(this.size);
      }
    });

    // Populate indexes in a single O(N) pass
    dataset.rows.forEach((row, rowIdx) => {
      dataset.headers.forEach((h, colIdx) => {
        const col = dataset.columns[colIdx];
        const val = row[colIdx];
        if (col.type === "categorical") {
          const strVal = String(val ?? "");
          if (!this.categoricalIndexes[h][strVal]) {
            this.categoricalIndexes[h][strVal] = new BitMap(this.size);
          }
          this.categoricalIndexes[h][strVal].set(rowIdx);
        } else {
          this.numericColumns[h][rowIdx] = val === null || val === "" ? NaN : Number(val);
        }
      });
    });
  }

  query(filters: Filter[]): number[] {
    if (filters.length === 0) {
      const all = new Array(this.size);
      for(let i = 0; i < this.size; i++) all[i] = i;
      return all;
    }

    let currentSet: BitMap | null = null;

    for (const f of filters) {
      const matched = new BitMap(this.size);
      
      const catIdx = this.categoricalIndexes[f.colName];
      const numCol = this.numericColumns[f.colName];

      if (catIdx) {
        // Bitwise Categorical Filtering (Virtually O(1))
        if (f.operator === "==") {
          const map = catIdx[f.value];
          if (map) {
             for(let i=0; i<map.words.length; i++) matched.words[i] = map.words[i];
          }
        } else if (f.operator === "!=") {
          const map = catIdx[f.value];
          if (map) {
             const notMap = BitMap.not(map);
             for(let i=0; i<notMap.words.length; i++) matched.words[i] = notMap.words[i];
          } else {
             matched.words.fill(0xFFFFFFFF);
          }
        } else if (f.operator === "is_empty") {
          const map = catIdx[""];
          if (map) {
             for(let i=0; i<map.words.length; i++) matched.words[i] = map.words[i];
          }
        } else if (f.operator === "is_not_empty") {
          const map = catIdx[""];
          if (map) {
             const notMap = BitMap.not(map);
             for(let i=0; i<notMap.words.length; i++) matched.words[i] = notMap.words[i];
          } else {
             matched.words.fill(0xFFFFFFFF);
          }
        } else if (f.operator === "contains") {
          const search = f.value.toLowerCase();
          for (const key of Object.keys(catIdx)) {
            if (key.toLowerCase().includes(search)) {
               const map = catIdx[key];
               for(let i=0; i<map.words.length; i++) matched.words[i] |= map.words[i];
            }
          }
        }
      } else if (numCol) {
        // Fast path contiguous memory scanning for numerics
        const target = Number(f.value);
        const op = f.operator;
        for (let i = 0; i < this.size; i++) {
          const val = numCol[i];
          let passes = false;
          if (op === "is_empty") passes = isNaN(val);
          else if (op === "is_not_empty") passes = !isNaN(val);
          else if (!isNaN(val) && !isNaN(target)) {
             if (op === "==") passes = val === target;
             else if (op === "!=") passes = val !== target;
             else if (op === ">") passes = val > target;
             else if (op === ">=") passes = val >= target;
             else if (op === "<") passes = val < target;
             else if (op === "<=") passes = val <= target;
          }
          if (passes) matched.set(i);
        }
      }

      // Bitwise intersection of constraints
      if (currentSet === null) {
        currentSet = matched;
      } else {
        currentSet = BitMap.and(currentSet, matched);
      }
    }

    // Unpack final bitset to row indices
    const results: number[] = [];
    if (currentSet) {
      for (let i = 0; i < this.size; i++) {
        if (currentSet.get(i)) results.push(i);
      }
    }
    return results;
  }
}
