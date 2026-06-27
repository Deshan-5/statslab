import React from "react";

export default function ToolSkeleton() {
  return (
    <div className="w-full min-h-[500px] flex flex-col lg:flex-row gap-6 p-6 animate-pulse">
      {/* Sidebar Controls Skeleton */}
      <div className="w-full lg:w-72 shrink-0 space-y-5">
        <div className="h-6 w-1/2 bg-neutral-200 dark:bg-neutral-800 rounded-md" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-4 w-1/3 bg-neutral-100 dark:bg-neutral-900 rounded" />
              <div className="h-8 bg-neutral-150 dark:bg-neutral-900 rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      {/* Main Canvas Skeleton */}
      <div className="flex-1 flex flex-col gap-6">
        <div className="h-8 w-1/4 bg-neutral-200 dark:bg-neutral-800 rounded-md" />
        <div className="flex-1 min-h-[300px] bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-2xl flex items-center justify-center">
          <div className="h-10 w-10 border-2 border-neutral-300 dark:border-neutral-700 border-t-neutral-800 dark:border-t-neutral-200 rounded-full animate-spin" />
        </div>
      </div>
    </div>
  );
}
