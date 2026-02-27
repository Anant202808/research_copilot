import { useState } from 'react';
import type { Paper, PaperTag } from '../types';

interface SmartTagsProps {
  paper: Paper;
  onUpdateTags: (paperId: string, tags: PaperTag[]) => void;
}

const TAG_COLORS = {
  method: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  dataset: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  problem: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  custom: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
};

export function SmartTags({ paper, onUpdateTags }: SmartTagsProps) {
  const [newTag, setNewTag] = useState('');
  const [newType, setNewType] = useState<PaperTag['type']>('custom');

  const addTag = () => {
    if (!newTag.trim()) return;
    const tag: PaperTag = { label: newTag.trim(), type: newType, auto: false };
    onUpdateTags(paper.id, [...paper.tags, tag]);
    setNewTag('');
  };

  const removeTag = (idx: number) => {
    onUpdateTags(paper.id, paper.tags.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-600">🏷️ Smart Tags</span>
        <span className="text-[10px] text-slate-400">Auto-generated + editable</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {paper.tags.map((tag, i) => {
          const colors = TAG_COLORS[tag.type];
          return (
            <span key={i} className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-medium border ${colors.bg} ${colors.text} ${colors.border}`}>
              {tag.auto && <span className="text-[8px]">🤖</span>}
              {tag.label}
              <button onClick={() => removeTag(i)} className="hover:text-red-500 transition-colors ml-0.5">×</button>
            </span>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <select value={newType} onChange={e => setNewType(e.target.value as PaperTag['type'])} className="text-[10px] px-1.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-600">
          <option value="method">Method</option>
          <option value="dataset">Dataset</option>
          <option value="problem">Problem</option>
          <option value="custom">Custom</option>
        </select>
        <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="Add tag..."
          className="flex-1 text-[10px] px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
        <button onClick={addTag} className="text-[10px] px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-medium hover:bg-indigo-100">+</button>
      </div>
    </div>
  );
}
