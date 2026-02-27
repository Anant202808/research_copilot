import { memo, useEffect } from 'react';

interface KeyboardHelpProps {
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['1'], desc: 'Dashboard' },
  { keys: ['2'], desc: 'Knowledge Graph' },
  { keys: ['3'], desc: 'Citations' },
  { keys: ['4'], desc: 'Gap Finder' },
  { keys: ['5'], desc: 'Timeline' },
  { keys: ['6'], desc: 'Insights' },
  { keys: ['D'], desc: 'Toggle Dark Mode' },
  { keys: ['U'], desc: 'Upload Paper' },
  { keys: ['S'], desc: 'Toggle Sidebar' },
  { keys: ['Esc'], desc: 'Close Panels' },
  { keys: ['?'], desc: 'Show Keyboard Help' },
  { keys: ['B'], desc: 'Bookmark Selected Paper' },
];

export const KeyboardHelp = memo(function KeyboardHelp({ onClose }: KeyboardHelpProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            ⌨️ Keyboard Shortcuts
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-1.5">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50">
              <span className="text-sm text-slate-600 dark:text-slate-300">{s.desc}</span>
              <div className="flex gap-1">
                {s.keys.map((k, j) => (
                  <kbd key={j} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
