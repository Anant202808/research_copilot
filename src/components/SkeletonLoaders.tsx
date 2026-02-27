/**
 * Skeleton loaders — show placeholder shapes instead of spinners.
 */

import { memo } from 'react';

const pulse = 'animate-pulse bg-slate-200 dark:bg-slate-700 rounded';

export const SkeletonCard = memo(function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${pulse}`} />
        <div className={`h-4 w-2/3 ${pulse}`} />
      </div>
      <div className={`h-3 w-full ${pulse}`} />
      <div className={`h-3 w-4/5 ${pulse}`} />
      <div className="flex gap-2 pt-2">
        <div className={`h-5 w-16 rounded-full ${pulse}`} />
        <div className={`h-5 w-20 rounded-full ${pulse}`} />
      </div>
    </div>
  );
});

export const SkeletonGraph = memo(function SkeletonGraph() {
  return (
    <div className="h-full bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center">
      <div className="space-y-6 text-center">
        <div className="flex justify-center gap-8">
          {[40, 30, 50, 35].map((s, i) => (
            <div key={i} className={`rounded-full ${pulse}`} style={{ width: s, height: s }} />
          ))}
        </div>
        <div className={`h-3 w-48 mx-auto ${pulse}`} />
        <div className={`h-3 w-32 mx-auto ${pulse}`} />
      </div>
    </div>
  );
});

export const SkeletonTimeline = memo(function SkeletonTimeline() {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
        <div className={`h-4 w-48 mb-4 ${pulse}`} />
        <div className={`h-2 w-full rounded-full ${pulse}`} />
        <div className="flex justify-between mt-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full ${pulse}`} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
            <div className={`h-8 w-16 ${pulse}`} />
            <div className={`h-3 w-full ${pulse}`} />
            <div className={`h-3 w-3/4 ${pulse}`} />
          </div>
        ))}
      </div>
    </div>
  );
});

export const SkeletonGap = memo(function SkeletonGap() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className={`h-4 w-40 ${pulse}`} />
            <div className={`h-5 w-16 rounded-full ${pulse}`} />
          </div>
          <div className={`h-3 w-full ${pulse}`} />
          <div className={`h-3 w-5/6 ${pulse}`} />
          <div className="flex gap-2">
            <div className={`h-6 w-24 rounded-lg ${pulse}`} />
            <div className={`h-6 w-16 rounded-lg ${pulse}`} />
          </div>
        </div>
      ))}
    </div>
  );
});

export const SkeletonInsight = memo(function SkeletonInsight() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg ${pulse}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-4 w-3/4 ${pulse}`} />
              <div className={`h-3 w-full ${pulse}`} />
              <div className={`h-3 w-2/3 ${pulse}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});
