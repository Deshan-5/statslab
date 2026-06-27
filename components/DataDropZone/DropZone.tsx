"use client";

/**
 * DataDropZone/DropZone.tsx
 *
 * The empty-state UI: dashed-border drop target + paste panel + error display.
 * Purely presentational — receives all handlers as props, owns zero state.
 */
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Database, AlertCircle } from "lucide-react";

type Props = {
  dragOver: boolean;
  showPaste: boolean;
  pasteText: string;
  parseError: string | null;
  fileRef: React.RefObject<HTMLInputElement>;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPasteSubmit: () => void;
  setPasteText: (t: string) => void;
  setShowPaste: (v: boolean) => void;
  loadExample: (name: string) => void;
};

export function DropZone({
  dragOver,
  showPaste,
  pasteText,
  parseError,
  fileRef,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileInput,
  onPasteSubmit,
  setPasteText,
  setShowPaste,
  loadExample,
}: Props) {
  return (
    <div className="space-y-3 relative overflow-visible">
      {/* Subtle Aura/Lighting surrounding the DropZone card */}
      <div 
        className="absolute top-1/2 left-1/2 w-[350px] h-[300px] sm:w-[780px] sm:h-[350px] pointer-events-none z-0 overflow-visible transition-all duration-300"
        style={{
          transform: `translate(-50%, -50%) scale(${dragOver ? 1.12 : 1})`
        }}
      >
        <div className="w-full h-full sl-glow-flow relative">
          {/* Dark mode glow (subtle orange radial aura) */}
          <div 
            className="absolute inset-0 rounded-full hidden dark:block transition-all duration-300"
            style={{
              background: `radial-gradient(circle at center, rgba(249, 115, 22, ${dragOver ? 0.40 : 0.24}) 0%, rgba(217, 119, 6, 0.05) 50%, transparent 75%)`
            }}
          />
          
          {/* Light mode glow (subtle soft orange radial aura) */}
          <div 
            className="absolute inset-0 rounded-full dark:hidden transition-all duration-300"
            style={{
              background: `radial-gradient(circle at center, rgba(254, 215, 170, ${dragOver ? 0.95 : 0.68}) 0%, rgba(255, 237, 213, 0.25) 50%, transparent 75%)`
            }}
          />
        </div>
      </div>

      {/* ── Drop target ──────────────────────────────────────────────── */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => { if (!showPaste) fileRef.current?.click(); }}
        className={`relative z-10 rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer group hover:scale-[1.01] ${
          dragOver
            ? "border-orange-500 bg-orange-55/40 dark:bg-orange-950/20 scale-[1.015]"
            : "border-neutral-200 dark:border-neutral-800 hover:border-orange-350/50 dark:hover:border-orange-500/20 bg-white/40 dark:bg-neutral-950/20 backdrop-blur-md hover:shadow-lg hover:shadow-orange-500/[0.02]"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,.dat"
          onChange={onFileInput}
          className="hidden"
        />

        <div className="px-6 py-8 flex flex-col items-center justify-center gap-4 text-center">
          {/* Icon */}
          <div
            className={`inline-flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${
              dragOver
                ? "bg-orange-100 dark:bg-orange-900/30 text-orange-500"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300"
            }`}
          >
            <Database className="w-4 h-4" />
          </div>

          {/* Label + example links */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-205">
              Drop a dataset to analyze
            </div>
            <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
              CSV, TSV, or raw numbers. Parsed locally in the browser.
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3 text-xs">
              <span className="text-neutral-400 dark:text-neutral-500 font-medium">Or try:</span>
              {(["iris", "heights", "abtest"] as const).map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); loadExample(ex); }}
                  className="text-neutral-600 dark:text-neutral-400 hover:text-orange-500 dark:hover:text-orange-400 font-semibold underline underline-offset-2 transition-colors px-0.5 capitalize"
                >
                  {ex === "abtest" ? "A/B Test" : ex.charAt(0).toUpperCase() + ex.slice(1)}
                </button>
              ))}
              <span className="text-neutral-300 dark:text-neutral-750 px-0.5">•</span>
              <button
                onClick={(e) => { e.stopPropagation(); setShowPaste(true); }}
                className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-750 dark:hover:text-neutral-200 underline underline-offset-2 transition-colors font-semibold"
              >
                or paste data
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Paste panel ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPaste && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-4 space-y-3">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"Paste CSV, TSV, or numbers.\n\nExamples:\n  12, 15, 18, 22, 25\n  name,score\n  Alice,85\n  Bob,92"}
                rows={5}
                className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2 text-sm font-mono text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600 resize-y"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={onPasteSubmit}
                  disabled={!pasteText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-30 transition-opacity"
                >
                  <Upload className="w-3.5 h-3.5" /> Analyze
                </button>
                <button
                  onClick={() => { setShowPaste(false); setPasteText(""); }}
                  className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error message ─────────────────────────────────────────────── */}
      {parseError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {parseError}
        </div>
      )}
    </div>
  );
}
