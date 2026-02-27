import { useState, useCallback, useRef, useEffect } from 'react';
import type { Paper } from '../types';
import type {
    DraftData,
    DraftSection,
    DraftAlert,
    DraftDiff,
    DraftStatus,
    DraftVersionSummary,
    SectionName,
} from '../types/draft';
import { getAIStatus } from '../services/aiService';
import {
    generateDraftV2,
    regenerateSection,
    getDraftStatus,
    getDraftHistory,
} from '../services/draftService';

// ── Section metadata ──────────────────────────────────────────────────────────
const SECTION_TYPES = [
    {
        id: 'literature review' as const,
        label: 'Literature Review',
        description:
            'Synthesizes existing research, identifies themes and contradictions across papers.',
        icon: '📚',
    },
] as const;

const SECTION_META: Record<string, { label: string; icon: string }> = {
    introduction: { label: 'Introduction', icon: '📖' },
    literature_review: { label: 'Literature Review', icon: '📚' },
    gaps: { label: 'Research Gaps', icon: '🔍' },
    discussion: { label: 'Discussion', icon: '💬' },
    future_work: { label: 'Future Work', icon: '🚀' },
    unknown: { label: 'Section', icon: '📄' },
};

type SectionType = (typeof SECTION_TYPES)[number]['id'];
type ExportFormat = 'pdf' | 'docx';

interface DraftWriterProps {
    papers: Paper[];
}

// ── Status styling ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<
    DraftStatus,
    { bg: string; border: string; text: string; dot: string; label: string }
> = {
    fresh: {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        text: 'text-emerald-700',
        dot: 'bg-emerald-500',
        label: 'Fresh',
    },
    outdated: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-700',
        dot: 'bg-red-500',
        label: 'Outdated',
    },
    partial: {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-700',
        dot: 'bg-amber-500',
        label: 'Partial',
    },
    stale: {
        bg: 'bg-slate-100',
        border: 'border-slate-300',
        text: 'text-slate-600',
        dot: 'bg-slate-400',
        label: 'Stale',
    },
};

const ALERT_STYLE: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: '🔴' },
    warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: '🟡' },
    info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: '🔵' },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIX: Draft text cleaner — strips/converts markdown and LaTeX before export
//
// Root cause of the weird monospace lines in the PDF:
//   1. "## Introduction" was passed raw to jsPDF → rendered as literal "##" text,
//      and jsPDF's internal font detection switched to courier on the "#" char.
//   2. "\(G\)" and "\[formula\]" LaTeX delimiters triggered jsPDF's math font
//      substitution, producing the spaced-out monospace effect visible in the PDF.
//   3. Both PDF and DOCX exporters called draft.split('\n\n') directly with
//      zero pre-processing — every markdown/LaTeX artifact was passed straight
//      through to the renderer.
//
// Fix: cleanDraftForExport() runs before both exportAsPDF and exportAsDOCX.
// It returns a { headings, paragraphs } structure so each exporter can style
// headings differently (bold/larger in PDF, HeadingLevel in DOCX).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type Block =
    | { type: 'heading'; level: number; text: string }
    | { type: 'paragraph'; text: string };

function cleanDraftForExport(draft: string): Block[] {
    const blocks: Block[] = [];

    for (const raw of draft.split('\n\n')) {
        const line = raw.trim();
        if (!line) continue;

        // Detect markdown headings: ## Intro, ### Sub, # Top
        const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
            blocks.push({
                type: 'heading',
                level: headingMatch[1].length,   // 1, 2, or 3
                text: cleanInlineMarkup(headingMatch[2]),
            });
            continue;
        }

        // Regular paragraph — clean inline markup then add
        const cleaned = cleanInlineMarkup(line);
        if (cleaned) {
            blocks.push({ type: 'paragraph', text: cleaned });
        }
    }

    return blocks;
}

/**
 * Strip inline markdown and LaTeX from a single text string.
 *
 * Handles:
 *   \(expr\)        → expr          (inline LaTeX math)
 *   \[expr\]        → expr          (display LaTeX math)
 *   $expr$          → expr          (alt inline math)
 *   **bold**        → bold
 *   *italic*        → italic
 *   `code`          → code
 *   [text](url)     → text
 *   remaining \     → (removed)
 */
function cleanInlineMarkup(text: string): string {
    return text
        // LaTeX inline math: \(G\) → G, \(\frac{1}{2}\) → 1/2
        .replace(/\\\((.+?)\\\)/g, (_m, expr) => simplifyLatex(expr))
        // LaTeX display math: \[...\] → ...
        .replace(/\\\[(.+?)\\\]/gs, (_m, expr) => simplifyLatex(expr))
        // Dollar-sign math: $expr$ → expr
        .replace(/\$(.+?)\$/g, (_m, expr) => simplifyLatex(expr))
        // Bold: **text** or __text__
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        // Italic: *text* or _text_
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        // Inline code: `text`
        .replace(/`(.+?)`/g, '$1')
        // Markdown links: [text](url) → text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Stray backslashes not part of a known sequence
        .replace(/\\(?![ntr])/g, '')
        // Collapse multiple spaces
        .replace(/  +/g, ' ')
        .trim();
}

/**
 * Simplify LaTeX math expressions to readable plain text.
 * We don't need to fully parse LaTeX — just make it not corrupt the PDF font.
 */
function simplifyLatex(expr: string): string {
    return expr
        .replace(/\\frac\{(.+?)\}\{(.+?)\}/g, '($1/$2)')
        .replace(/\\mathbb\{(.+?)\}/g, '$1')
        .replace(/\\mathcal\{(.+?)\}/g, '$1')
        .replace(/\\text\{(.+?)\}/g, '$1')
        .replace(/\\left/g, '')
        .replace(/\\right/g, '')
        .replace(/\{|\}/g, '')
        .replace(/\\/g, '')
        .trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Export helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function exportAsPDF(
    draft: string,
    sectionLabel: string,
    paperTitles: string[],
): Promise<void> {
    const { jsPDF } = await import('jspdf');

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 56;
    const maxW = pageW - margin * 2;
    let y = margin;

    const newPageIfNeeded = (needed: number) => {
        if (y + needed > pageH - margin) {
            doc.addPage();
            y = margin;
        }
    };

    // ── Cover / header ────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(30, 27, 75);
    doc.text(sectionLabel, margin, y);
    y += 30;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(
        `Generated from ${paperTitles.length} paper${paperTitles.length !== 1 ? 's' : ''} · ResearchGraph AI`,
        margin,
        y,
    );
    y += 8;

    doc.setDrawColor(199, 210, 254);
    doc.setLineWidth(0.75);
    doc.line(margin, y, pageW - margin, y);
    y += 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(67, 56, 202);
    doc.text('SOURCE PAPERS', margin, y);
    y += 14;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    for (const [i, title] of paperTitles.entries()) {
        const lines = doc.splitTextToSize(`${i + 1}. ${title}`, maxW);
        newPageIfNeeded(lines.length * 12);
        doc.text(lines, margin, y);
        y += lines.length * 12 + 2;
    }
    y += 16;

    doc.setDrawColor(199, 210, 254);
    doc.line(margin, y, pageW - margin, y);
    y += 22;

    // ── FIX: use cleaned blocks instead of raw paragraphs ────────────────────
    const blocks = cleanDraftForExport(draft);

    for (const block of blocks) {
        if (block.type === 'heading') {
            // Style headings by level instead of dumping "## text"
            const fontSize = block.level === 1 ? 15 : block.level === 2 ? 13 : 11;
            const topPad = block.level === 1 ? 14 : 10;
            newPageIfNeeded(fontSize + topPad + 8);
            y += topPad;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(fontSize);
            doc.setTextColor(30, 27, 75);
            const lines = doc.splitTextToSize(block.text, maxW);
            doc.text(lines, margin, y);
            y += lines.length * (fontSize + 3) + 4;

            // Underline for H2
            if (block.level === 2) {
                doc.setDrawColor(199, 210, 254);
                doc.setLineWidth(0.5);
                doc.line(margin, y, margin + 120, y);
                y += 6;
            }
        } else {
            // Regular paragraph — plain helvetica, no LaTeX artifacts
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.setTextColor(15, 23, 42);
            const lines = doc.splitTextToSize(block.text, maxW);
            const blockH = lines.length * 15.5;
            newPageIfNeeded(blockH);
            doc.text(lines, margin, y);
            y += blockH + 10;
        }
    }

    // ── Page numbers ──────────────────────────────────────────────────────────
    const total = (doc.internal as any).getNumberOfPages();
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
            `ResearchGraph AI  ·  ${sectionLabel}  ·  Page ${i} of ${total}`,
            margin,
            pageH - 26,
        );
    }

    doc.save(`${sectionLabel.replace(/\s+/g, '_')}_draft.pdf`);
}

async function exportAsDOCX(
    draft: string,
    sectionLabel: string,
    paperTitles: string[],
): Promise<void> {
    const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        HeadingLevel,
        AlignmentType,
        BorderStyle,
        Table,
        TableRow,
        TableCell,
        WidthType,
    } = await import('docx');

    // ── FIX: use cleaned blocks instead of raw paragraphs ────────────────────
    const blocks = cleanDraftForExport(draft);

    const noBorder = {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
    };

    const sourceRows = paperTitles.map(
        (title, i) =>
            new TableRow({
                children: [
                    new TableCell({
                        borders: noBorder,
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: `${i + 1}.`,
                                        bold: true,
                                        size: 18,
                                        color: '6366F1',
                                        font: 'Calibri',
                                    }),
                                ],
                            }),
                        ],
                        width: { size: 5, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                        borders: noBorder,
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: title,
                                        size: 18,
                                        color: '334155',
                                        font: 'Calibri',
                                    }),
                                ],
                            }),
                        ],
                        width: { size: 95, type: WidthType.PERCENTAGE },
                    }),
                ],
            }),
    );

    // Map each cleaned block to a docx Paragraph with proper heading levels
    const contentChildren = blocks.map((block) => {
        if (block.type === 'heading') {
            const headingLevel =
                block.level === 1
                    ? HeadingLevel.HEADING_1
                    : block.level === 2
                        ? HeadingLevel.HEADING_2
                        : HeadingLevel.HEADING_3;
            const fontSize = block.level === 1 ? 28 : block.level === 2 ? 24 : 20;
            return new Paragraph({
                heading: headingLevel,
                spacing: { before: 240, after: 120 },
                children: [
                    new TextRun({
                        text: block.text,
                        bold: true,
                        size: fontSize,
                        color: block.level === 1 ? '1e1b4b' : '4338ca',
                        font: 'Calibri',
                    }),
                ],
            });
        }
        // Paragraph
        return new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 200, line: 360 },
            children: [
                new TextRun({
                    text: block.text,
                    size: 22,
                    font: 'Calibri',
                    color: '1e293b',
                }),
            ],
        });
    });

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: { font: 'Calibri', size: 22, color: '0f172a' },
                },
            },
        },
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: 1080,
                            bottom: 1080,
                            left: 1080,
                            right: 1080,
                        },
                    },
                },
                children: [
                    new Paragraph({
                        heading: HeadingLevel.HEADING_1,
                        spacing: { after: 100 },
                        children: [
                            new TextRun({
                                text: sectionLabel,
                                bold: true,
                                size: 40,
                                color: '1e1b4b',
                                font: 'Calibri',
                            }),
                        ],
                    }),
                    new Paragraph({
                        spacing: { after: 280 },
                        children: [
                            new TextRun({
                                text: `Generated from ${paperTitles.length} paper${paperTitles.length !== 1 ? 's' : ''} · ResearchGraph AI`,
                                size: 18,
                                color: '6b7280',
                                italics: true,
                                font: 'Calibri',
                            }),
                        ],
                    }),
                    new Paragraph({
                        heading: HeadingLevel.HEADING_2,
                        spacing: { before: 100, after: 120 },
                        children: [
                            new TextRun({
                                text: 'Source Papers',
                                bold: true,
                                size: 22,
                                color: '4338ca',
                                font: 'Calibri',
                            }),
                        ],
                    }),
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: sourceRows,
                        borders: noBorder,
                    }),
                    new Paragraph({ spacing: { after: 280 }, children: [] }),
                    // All cleaned content blocks
                    ...contentChildren,
                    new Paragraph({ spacing: { before: 560 }, children: [] }),
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: 'Note: ',
                                bold: true,
                                size: 18,
                                color: 'b45309',
                                font: 'Calibri',
                            }),
                            new TextRun({
                                text: 'This draft was AI-generated from paper summaries and citations. Always verify inline citations against the original sources before submission.',
                                size: 18,
                                color: 'b45309',
                                italics: true,
                                font: 'Calibri',
                            }),
                        ],
                    }),
                ],
            },
        ],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sectionLabel.replace(/\s+/g, '_')}_draft.docx`;
    a.click();
    URL.revokeObjectURL(url);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub-components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StatusBadge({ status }: { status: DraftStatus }) {
    const cfg = STATUS_CONFIG[status];
    return (
        <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text}`}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </span>
    );
}

function AlertBanner({ alert }: { alert: DraftAlert }) {
    const style = ALERT_STYLE[alert.level] || ALERT_STYLE.info;
    return (
        <div
            className={`flex items-start gap-2.5 p-3 rounded-xl border ${style.bg} ${style.border} animate-slide-up`}
        >
            <span className="flex-shrink-0 text-sm">{style.icon}</span>
            <div className="min-w-0">
                <p className={`text-xs font-semibold ${style.text}`}>
                    {alert.code.replace(/_/g, ' ')}
                </p>
                <p className={`text-[11px] mt-0.5 leading-relaxed ${style.text} opacity-80`}>
                    {alert.message}
                </p>
            </div>
        </div>
    );
}

function SectionCard({
    section,
    isChanged,
    isRegenerating,
    onRegenerate,
}: {
    section: DraftSection;
    isChanged: boolean;
    isRegenerating: boolean;
    onRegenerate: (name: SectionName) => void;
}) {
    const meta = SECTION_META[section.name] || SECTION_META.unknown;
    const sectionStatus = STATUS_CONFIG[section.status];

    return (
        <div
            className={`border rounded-xl overflow-hidden transition-all ${isChanged
                ? 'border-indigo-300 ring-2 ring-indigo-100'
                : 'border-slate-200'
                }`}
        >
            {/* Section header */}
            <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                    <span className="text-lg">{meta.icon}</span>
                    <span className="text-sm font-semibold text-slate-700">
                        {section.heading || meta.label}
                    </span>
                    <StatusBadge status={section.status} />
                    {isChanged && (
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                            CHANGED
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-400 font-medium">
                        {section.citation_count} citation
                        {section.citation_count !== 1 ? 's' : ''}
                    </span>

                    <button
                        onClick={() => onRegenerate(section.name as SectionName)}
                        disabled={isRegenerating}
                        className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg border bg-white border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isRegenerating ? (
                            <>
                                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Regenerating…
                            </>
                        ) : (
                            <>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Regen
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Section content */}
            <div className="p-5">
                <div className="prose prose-sm prose-slate max-w-none">
                    {section.content
                        .split('\n\n')
                        .filter((p) => p.trim())
                        .map((paragraph, i) => (
                            <p key={i} className="text-sm text-slate-700 leading-7 mb-4 last:mb-0">
                                {paragraph.trim()}
                            </p>
                        ))}
                </div>
            </div>
        </div>
    );
}

function VersionHistoryPanel({
    versions,
    currentVersion,
    onSelectVersion,
}: {
    versions: DraftVersionSummary[];
    currentVersion: number;
    onSelectVersion: (v: number) => void;
}) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-semibold text-slate-700">Version History</span>
                    <span className="text-xs text-slate-400 ml-auto">
                        {versions.length} version{versions.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {[...versions].reverse().map((v) => (
                    <button
                        key={v.draft_id}
                        onClick={() => onSelectVersion(v.version)}
                        className={`w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors ${v.version === currentVersion ? 'bg-indigo-50/50' : ''}`}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-600">v{v.version}</span>
                                <StatusBadge status={v.status} />
                                {v.version === currentVersion && (
                                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                                        CURRENT
                                    </span>
                                )}
                            </div>
                            <span className="text-[10px] text-slate-400">
                                {v.citation_count} citations · {v.section_count} sections
                            </span>
                        </div>
                        {v.regeneration_reason && (
                            <p className="text-[11px] text-slate-500 mt-1 truncate">
                                Reason: {v.regeneration_reason}
                            </p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(v.generated_at).toLocaleString()}
                        </p>
                    </button>
                ))}
            </div>
        </div>
    );
}

function DiffSummary({ diff }: { diff: DraftDiff }) {
    return (
        <div className="bg-indigo-50/50 border border-indigo-200 rounded-xl p-4 animate-slide-up">
            <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <span className="text-xs font-bold text-indigo-700">
                    Changes from v{diff.from_version} → v{diff.to_version}
                </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {diff.sections_changed.length > 0 && (
                    <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Changed</p>
                        <div className="flex flex-wrap gap-1">
                            {diff.sections_changed.map((s) => (
                                <span key={s} className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                                    {SECTION_META[s]?.label || s}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
                {diff.sections_added.length > 0 && (
                    <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Added</p>
                        <div className="flex flex-wrap gap-1">
                            {diff.sections_added.map((s) => (
                                <span key={s} className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium">
                                    {SECTION_META[s]?.label || s}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
                <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Citations</p>
                    <span className={`text-xs font-bold ${diff.citation_delta > 0 ? 'text-emerald-600' : diff.citation_delta < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                        {diff.citation_delta > 0 ? '+' : ''}{diff.citation_delta}
                    </span>
                </div>
                {diff.paper_ids_added.length > 0 && (
                    <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">New papers</p>
                        <span className="text-xs font-bold text-indigo-600">+{diff.paper_ids_added.length}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function DraftWriter({ papers }: DraftWriterProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [section, setSection] = useState<SectionType>('literature review');
    const [draftData, setDraftData] = useState<DraftData | null>(null);
    const [alerts, setAlerts] = useState<DraftAlert[]>([]);
    const [diff, setDiff] = useState<DraftDiff | null>(null);
    const [versions, setVersions] = useState<DraftVersionSummary[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
    const [exportingFmt, setExportingFmt] = useState<ExportFormat | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const draftRef = useRef<HTMLDivElement>(null);

    const draftText = draftData?.text || '';
    const selectedPapers = papers.filter((p) => selectedIds.has(p.id));
    const selectedSection = SECTION_TYPES.find((s) => s.id === section)!;

    useEffect(() => {
        getDraftStatus()
            .then((status) => {
                if (status.has_draft && status.alerts) setAlerts(status.alerts);
            })
            .catch(() => { });
    }, []);

    const loadHistory = useCallback(async () => {
        try {
            const data = await getDraftHistory();
            setVersions(data.versions);
        } catch { }
    }, []);

    useEffect(() => {
        if (showHistory) loadHistory();
    }, [showHistory, loadHistory]);

    const togglePaper = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else if (next.size < 10) next.add(id);
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        setSelectedIds(new Set(papers.slice(0, 10).map((p) => p.id)));
    }, [papers]);

    const handleGenerate = useCallback(async () => {
        if (selectedIds.size < 2) return;
        setIsGenerating(true);
        setError(null);
        setDiff(null);

        const aiStatus = getAIStatus();
        if (aiStatus.status !== 'ready' || aiStatus.provider !== 'backend') {
            setError('Backend not connected. Please start the Flask server.');
            setIsGenerating(false);
            return;
        }

        try {
            const reason = draftData ? 'User requested regeneration' : 'Initial generation';
            const result = await generateDraftV2([...selectedIds], section, [], reason, true);
            setDraftData(result.draft);
            setAlerts(result.alerts);
            setDiff(result.diff);
            if (showHistory) loadHistory();
            setTimeout(() => draftRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        } catch (e: any) {
            setError(e.message || 'Draft generation failed.');
        } finally {
            setIsGenerating(false);
        }
    }, [selectedIds, section, draftData, showHistory, loadHistory]);

    const handleRegenerateSection = useCallback(async (sectionName: SectionName) => {
        if (selectedIds.size < 2) return;
        setRegeneratingSection(sectionName);
        setError(null);
        try {
            const result = await regenerateSection(sectionName, [...selectedIds], [], `Regenerate ${sectionName}`);
            setDraftData(result.draft);
            setAlerts(result.alerts);
            setDiff(result.diff);
            if (showHistory) loadHistory();
        } catch (e: any) {
            setError(e.message || `Failed to regenerate ${sectionName}.`);
        } finally {
            setRegeneratingSection(null);
        }
    }, [selectedIds, showHistory, loadHistory]);

    const handleCopy = useCallback(() => {
        if (!draftText) return;
        navigator.clipboard.writeText(draftText).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [draftText]);

    const handleExport = useCallback(async (fmt: ExportFormat) => {
        if (!draftText || exportingFmt) return;
        setExportingFmt(fmt);
        setError(null);
        const label = selectedSection.label;
        const titles = selectedPapers.map((p) => p.title);
        try {
            if (fmt === 'pdf') await exportAsPDF(draftText, label, titles);
            else await exportAsDOCX(draftText, label, titles);
        } catch {
            setError(
                fmt === 'pdf'
                    ? 'PDF export failed. Install jspdf: npm install jspdf'
                    : 'Word export failed. Install docx: npm install docx',
            );
        } finally {
            setExportingFmt(null);
        }
    }, [draftText, selectedSection, selectedPapers, exportingFmt]);

    const handleSelectVersion = useCallback(async (version: number) => {
        if (draftData && version === draftData.version) return;
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/draft/version/${version}`);
            const data = await res.json();
            if (data.draft) setDraftData(data.draft);
        } catch { }
    }, [draftData]);

    if (papers.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 animate-fade-in">
                <div className="w-16 h-16 mb-4 rounded-2xl bg-slate-100 flex items-center justify-center text-3xl">✍️</div>
                <p className="text-lg font-semibold text-slate-500">No Papers Yet</p>
                <p className="text-sm mt-1 text-slate-400">Upload papers first to generate a draft</p>
            </div>
        );
    }
    if (papers.length < 2) {
        return (
            <div className="flex flex-col items-center justify-center h-64 animate-fade-in">
                <div className="w-16 h-16 mb-4 rounded-2xl bg-slate-100 flex items-center justify-center text-3xl">📄</div>
                <p className="text-lg font-semibold text-slate-500">Need More Papers</p>
                <p className="text-sm mt-1 text-slate-400">Upload at least 2 papers to generate a draft</p>
            </div>
        );
    }

    const changedSections = new Set(diff?.sections_changed || []);

    return (
        <div className="space-y-6 animate-fade-in">
            {draftData && (
                <div className={`flex items-center justify-between p-4 rounded-xl border ${STATUS_CONFIG[draftData.status].bg} ${STATUS_CONFIG[draftData.status].border}`}>
                    <div className="flex items-center gap-3">
                        <StatusBadge status={draftData.status} />
                        <span className="text-xs text-slate-500">
                            v{draftData.version} · {draftData.citation_count} citations · {draftData.sections.length} sections
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            className={`text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-all ${showHistory ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                            <span className="flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                History
                            </span>
                        </button>
                    </div>
                </div>
            )}

            {alerts.length > 0 && (
                <div className="space-y-2">
                    {alerts.map((alert, i) => <AlertBanner key={`${alert.code}-${i}`} alert={alert} />)}
                </div>
            )}

            {showHistory && versions.length > 0 && (
                <VersionHistoryPanel versions={versions} currentVersion={draftData?.version || 0} onSelectVersion={handleSelectVersion} />
            )}

            {diff && <DiffSummary diff={diff} />}

            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-6">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white shadow-sm border border-indigo-100 flex items-center justify-center text-2xl flex-shrink-0">✍️</div>
                    <div>
                        <h2 className="text-base font-bold text-slate-800">Draft Writer</h2>
                        <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
                            Select papers and let AI write a structured academic section with inline citations. Now with{' '}
                            <span className="font-medium text-indigo-600">versioning</span>,{' '}
                            <span className="font-medium text-indigo-600">section-level control</span>, and{' '}
                            <span className="font-medium text-indigo-600">smart alerts</span>.
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                    <h3 className="text-sm font-semibold text-slate-800">Choose Section Type</h3>
                </div>
                <div className="grid grid-cols-1 gap-3">
                    {SECTION_TYPES.map((s) => (
                        <button
                            key={s.id}
                            onClick={() => setSection(s.id)}
                            className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${section === s.id ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200/50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                        >
                            <span className="text-2xl mt-0.5 flex-shrink-0">{s.icon}</span>
                            <div>
                                <p className="text-sm font-semibold text-slate-800">{s.label}</p>
                                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{s.description}</p>
                            </div>
                            <div className={`ml-auto mt-1 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${section === s.id ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'}`}>
                                {section === s.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                        <h3 className="text-sm font-semibold text-slate-800">Select Papers to Include</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={selectAll} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Select All</button>
                        <span className="text-xs text-slate-300">|</span>
                        <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-500 hover:text-slate-700 font-medium">Clear</button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {papers.map((paper) => (
                        <button
                            key={paper.id}
                            onClick={() => togglePaper(paper.id)}
                            className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${selectedIds.has(paper.id) ? 'border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200' : 'border-slate-150 hover:border-slate-300 hover:bg-slate-50'}`}
                        >
                            <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${selectedIds.has(paper.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                                {selectedIds.has(paper.id) && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate">{paper.title}</p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {paper.authors[0]}{paper.authors.length > 1 ? ' et al.' : ''}, {paper.year}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>

                {selectedIds.size > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                            {selectedIds.size} paper{selectedIds.size !== 1 ? 's' : ''} selected
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {selectedPapers.map((p) => (
                                <span key={p.id} className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full font-medium flex items-center gap-1">
                                    {p.title.length > 30 ? p.title.slice(0, 30) + '…' : p.title}
                                    <button onClick={(e) => { e.stopPropagation(); togglePaper(p.id); }} className="text-indigo-400 hover:text-indigo-600 ml-0.5">×</button>
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                    <h3 className="text-sm font-semibold text-slate-800">Generate Draft</h3>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-100">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400 text-xs">Section:</span>
                            <span className="text-xs font-semibold text-indigo-700 px-2 py-0.5 bg-indigo-50 rounded-full border border-indigo-100">
                                {selectedSection.icon} {selectedSection.label}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400 text-xs">Papers:</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${selectedIds.size >= 2 ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-amber-700 bg-amber-50 border-amber-100'}`}>
                                {selectedIds.size} selected {selectedIds.size < 2 && '(min 2)'}
                            </span>
                        </div>
                        {draftData && (
                            <div className="flex items-center gap-2">
                                <span className="text-slate-400 text-xs">Current:</span>
                                <StatusBadge status={draftData.status} />
                            </div>
                        )}
                    </div>
                </div>

                <button
                    onClick={handleGenerate}
                    disabled={selectedIds.size < 2 || isGenerating}
                    className="w-full flex items-center justify-center gap-2.5 px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-indigo-200 active:scale-[0.98]"
                >
                    {isGenerating ? (
                        <>
                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Generating {selectedSection.label}…
                        </>
                    ) : (
                        <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            {draftData ? 'Regenerate Full Draft' : `Generate ${selectedSection.label}`}
                        </>
                    )}
                </button>

                {error && (
                    <div className="mt-3 flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl animate-slide-up">
                        <span className="text-red-500 flex-shrink-0">⚠️</span>
                        <p className="text-xs text-red-700 leading-relaxed">{error}</p>
                    </div>
                )}
            </div>

            {draftData && !isGenerating && (
                <div ref={draftRef} className="space-y-4 animate-slide-up">
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200 flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-700">{selectedSection.icon} {selectedSection.label}</span>
                                <span className="text-xs text-slate-400 px-2 py-0.5 bg-white border border-slate-200 rounded-full">v{draftData.version}</span>
                                <StatusBadge status={draftData.status} />
                                <span className="text-xs text-slate-400 px-2 py-0.5 bg-white border border-slate-200 rounded-full">{draftData.citation_count} citations</span>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={handleCopy}
                                    className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${copied ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                >
                                    {copied ? '✓ Copied!' : 'Copy'}
                                </button>

                                <button
                                    onClick={() => handleExport('pdf')}
                                    disabled={!!exportingFmt}
                                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border bg-white border-rose-200 text-rose-600 hover:bg-rose-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {exportingFmt === 'pdf' ? 'Exporting…' : 'PDF'}
                                </button>

                                <button
                                    onClick={() => handleExport('docx')}
                                    disabled={!!exportingFmt}
                                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border bg-white border-blue-200 text-blue-600 hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {exportingFmt === 'docx' ? 'Exporting…' : 'Word'}
                                </button>

                                <button
                                    onClick={handleGenerate}
                                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-all"
                                >
                                    Regenerate All
                                </button>
                            </div>
                        </div>
                    </div>

                    {draftData.sections.length > 0 ? (
                        <div className="space-y-3">
                            {draftData.sections.map((sec) => (
                                <SectionCard
                                    key={sec.name}
                                    section={sec}
                                    isChanged={changedSections.has(sec.name)}
                                    isRegenerating={regeneratingSection === sec.name}
                                    onRegenerate={handleRegenerateSection}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white border border-slate-200 rounded-xl p-6">
                            <div className="prose prose-sm prose-slate max-w-none">
                                {draftText.split('\n\n').filter((p) => p.trim()).map((paragraph, i) => (
                                    <p key={i} className="text-sm text-slate-700 leading-7 mb-4 last:mb-0">
                                        {paragraph.trim()}
                                    </p>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                        <span className="text-amber-500 text-sm flex-shrink-0">💡</span>
                        <p className="text-[11px] text-amber-700 leading-relaxed">
                            This draft was generated from your papers' summaries and citations. Always verify inline citations against original sources before submission.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}