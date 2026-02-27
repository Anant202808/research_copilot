import type { Paper, GraphData, GapAnalysisResult, Citation, ResearchGap, EvidenceLink, InsightCard, ExplainableInsight, ConceptGraphData, TimelineEntry, PaperTag, GapConstraints } from '../types';
export const DEMO_MODE = false;
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];

function autoTag(keywords: string[], methodology: string): PaperTag[] {
  const tags: PaperTag[] = [];
  const methodKw = ['transformer', 'CNN', 'RNN', 'LSTM', 'GAN', 'attention', 'self-supervised', 'supervised', 'unsupervised', 'reinforcement', 'pre-training', 'fine-tuning'];
  const dataKw = ['ImageNet', 'WebText', 'Common Crawl', 'GLUE', 'SuperGLUE', 'WMT', 'CIFAR', 'JFT'];
  const probKw = ['classification', 'translation', 'generation', 'detection', 'segmentation', 'summarization', 'question answering'];
  const allText = [...keywords, methodology].join(' ').toLowerCase();
  for (const m of methodKw) {
    if (allText.includes(m.toLowerCase())) tags.push({ label: m, type: 'method', auto: true });
  }
  for (const d of dataKw) {
    if (allText.includes(d.toLowerCase())) tags.push({ label: d, type: 'dataset', auto: true });
  }
  for (const p of probKw) {
    if (allText.includes(p.toLowerCase())) tags.push({ label: p, type: 'problem', auto: true });
  }
  return tags.slice(0, 6);
}

// Demo papers are preserved but only loaded when DEMO_MODE is true
const _demoPapers: Paper[] = [
  {
    id: 'paper-1',
    title: 'Attention Is All You Need',
    authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit', 'Llion Jones', 'Aidan N. Gomez', 'Łukasz Kaiser', 'Illia Polosukhin'],
    year: 2017,
    abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.',
    summary: {
      overview: 'This landmark paper introduces the Transformer architecture, which relies entirely on self-attention mechanisms. The model achieves state-of-the-art results on machine translation benchmarks while being more parallelizable and efficient to train.',
      findings: ['Self-attention can replace recurrence for sequence modeling', 'Multi-head attention enables attending to different representation subspaces', 'Achieved 28.4 BLEU on WMT 2014 English-to-German', 'Training time reduced to 3.5 days on 8 GPUs'],
      methodology: 'Sequence-to-sequence architecture using stacked self-attention and point-wise fully connected layers with multi-head attention, positional encoding, and layer normalization.',
      limitations: ['O(n²) complexity with sequence length', 'Fixed positional encodings', 'Evaluation limited to machine translation', 'Large model sizes require significant compute']
    },
    citations: [
      { id: 'c1-1', title: 'Neural Machine Translation by Jointly Learning to Align and Translate', authors: ['Dzmitry Bahdanau', 'Kyunghyun Cho', 'Yoshua Bengio'], year: 2015, journal: 'ICLR', doi: '10.48550/arXiv.1409.0473' },
      { id: 'c1-2', title: 'Sequence to Sequence Learning with Neural Networks', authors: ['Ilya Sutskever', 'Oriol Vinyals', 'Quoc V. Le'], year: 2014, journal: 'NeurIPS', pages: '3104-3112' },
      { id: 'c1-3', title: 'Long Short-Term Memory', authors: ['Sepp Hochreiter', 'Jürgen Schmidhuber'], year: 1997, journal: 'Neural Computation', volume: '9', issue: '8', pages: '1735-1780' },
    ],
    keywords: ['transformer', 'attention mechanism', 'neural machine translation', 'self-attention', 'sequence-to-sequence', 'encoder-decoder'],
    color: COLORS[0],
    tags: autoTag(['transformer', 'attention mechanism', 'translation'], 'self-attention transformer'),
    bookmarked: false,
  },
  {
    id: 'paper-2',
    title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
    authors: ['Jacob Devlin', 'Ming-Wei Chang', 'Kenton Lee', 'Kristina Toutanova'],
    year: 2019,
    abstract: 'We introduce BERT, designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context.',
    summary: {
      overview: 'BERT introduces bidirectional pre-training using masked language modeling, achieving breakthrough results across 11 NLP benchmarks with minimal task-specific architecture changes.',
      findings: ['Bidirectional pre-training outperforms unidirectional approaches', 'Masked language modeling enables bidirectional learning', 'State-of-the-art on 11 NLP tasks', 'BERT Large achieves 80.5 on SuperGLUE'],
      methodology: 'Multi-layer bidirectional Transformer encoder pre-trained with Masked Language Model (MLM) and Next Sentence Prediction (NSP), then fine-tuned with one output layer.',
      limitations: ['Pre-training is computationally expensive', 'Masking mismatch between pre-training and fine-tuning', 'Model size challenges edge deployment', 'Limited text generation capability']
    },
    citations: [
      { id: 'c2-1', title: 'Attention Is All You Need', authors: ['Ashish Vaswani', 'Noam Shazeer'], year: 2017, journal: 'NeurIPS', pages: '5998-6008' },
      { id: 'c2-2', title: 'Deep Contextualized Word Representations', authors: ['Matthew E. Peters', 'Mark Neumann'], year: 2018, journal: 'NAACL', pages: '2227-2237' },
      { id: 'c2-3', title: 'Improving Language Understanding by Generative Pre-Training', authors: ['Alec Radford', 'Karthik Narasimhan'], year: 2018, journal: 'OpenAI Technical Report' },
    ],
    keywords: ['BERT', 'pre-training', 'language model', 'transfer learning', 'NLP', 'bidirectional'],
    color: COLORS[1],
    tags: autoTag(['BERT', 'pre-training', 'NLP'], 'pre-training transformer fine-tuning GLUE'),
    bookmarked: false,
  },
  {
    id: 'paper-3',
    title: 'Language Models are Few-Shot Learners',
    authors: ['Tom B. Brown', 'Benjamin Mann', 'Nick Ryder', 'Melanie Subbiah', 'Jared Kaplan'],
    year: 2020,
    abstract: 'We show that scaling up language models greatly improves task-agnostic, few-shot performance, sometimes matching fine-tuning approaches.',
    summary: {
      overview: 'GPT-3 demonstrates that scaling to 175B parameters enables strong few-shot learning without fine-tuning, challenging the task-specific fine-tuning paradigm.',
      findings: ['175B parameters enables strong few-shot learning', 'In-context learning improves log-linearly with scale', 'Near state-of-the-art in zero/few-shot settings', 'Can generate realistic news articles'],
      methodology: 'Autoregressive Transformer scaled to 175B parameters, trained on filtered Common Crawl, WebText2, Books, and Wikipedia. Evaluated in zero-shot, one-shot, and few-shot settings.',
      limitations: ['Enormous training cost (~$4.6M)', 'Can generate biased/harmful content', 'Some tasks below fine-tuned models', 'In-context learning mechanism not well understood']
    },
    citations: [
      { id: 'c3-1', title: 'Attention Is All You Need', authors: ['Ashish Vaswani', 'Noam Shazeer'], year: 2017, journal: 'NeurIPS', pages: '5998-6008' },
      { id: 'c3-2', title: 'BERT: Pre-training of Deep Bidirectional Transformers', authors: ['Jacob Devlin'], year: 2019, journal: 'NAACL', pages: '4171-4186' },
      { id: 'c3-3', title: 'Scaling Laws for Neural Language Models', authors: ['Jared Kaplan'], year: 2020, journal: 'arXiv preprint' },
    ],
    keywords: ['GPT-3', 'few-shot learning', 'language model', 'in-context learning', 'scaling', 'autoregressive'],
    color: COLORS[2],
    tags: autoTag(['GPT-3', 'few-shot', 'language model'], 'autoregressive transformer Common Crawl generation'),
    bookmarked: false,
  },
  {
    id: 'paper-4',
    title: 'An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale',
    authors: ['Alexey Dosovitskiy', 'Lucas Beyer', 'Alexander Kolesnikov', 'Dirk Weissenborn'],
    year: 2021,
    abstract: 'We show that a pure transformer applied directly to sequences of image patches can perform very well on image classification tasks.',
    summary: {
      overview: 'Vision Transformer (ViT) applies the Transformer directly to image patches, matching or exceeding CNNs when pre-trained on large datasets.',
      findings: ['Pure Transformer matches or exceeds CNNs', 'Large-scale pre-training crucial for ViT', 'ViT-Huge achieves 88.55% on ImageNet', 'Learns to attend to semantic image regions'],
      methodology: 'Images split into 16x16 patches, linearly embedded as tokens. Standard Transformer encoder with positional embeddings. Pre-trained on JFT-300M then fine-tuned.',
      limitations: ['Requires very large pre-training datasets', 'Loses fine-grained spatial information', 'Quadratic cost with patch count', 'Not effective for dense prediction without modifications']
    },
    citations: [
      { id: 'c4-1', title: 'Attention Is All You Need', authors: ['Ashish Vaswani'], year: 2017, journal: 'NeurIPS', pages: '5998-6008' },
      { id: 'c4-2', title: 'BERT: Pre-training of Deep Bidirectional Transformers', authors: ['Jacob Devlin'], year: 2019, journal: 'NAACL', pages: '4171-4186' },
      { id: 'c4-3', title: 'Deep Residual Learning for Image Recognition', authors: ['Kaiming He'], year: 2016, journal: 'CVPR', pages: '770-778' },
    ],
    keywords: ['vision transformer', 'ViT', 'image classification', 'computer vision', 'patch embedding', 'transfer learning'],
    color: COLORS[3],
    tags: autoTag(['ViT', 'image classification', 'computer vision'], 'transformer ImageNet classification'),
    bookmarked: false,
  },
  {
    id: 'paper-5',
    title: 'Scaling Laws for Neural Language Models',
    authors: ['Jared Kaplan', 'Sam McCandlish', 'Tom Henighan', 'Tom B. Brown'],
    year: 2020,
    abstract: 'We study empirical scaling laws for language model performance. The loss scales as a power-law with model size, dataset size, and compute.',
    summary: {
      overview: 'Establishes precise empirical scaling laws showing performance improves predictably as power laws of model size, dataset size, and compute budget.',
      findings: ['Loss follows power-law scaling', 'Larger models are more sample-efficient', 'Optimal compute favors larger models on less data', 'Trends hold across seven orders of magnitude'],
      methodology: 'Systematic experiments training Transformers of varying sizes (768 to 1.5B params) on WebText2, evaluated on cross-entropy loss across compute budgets.',
      limitations: ['May not hold at extreme scales', 'Focused on autoregressive modeling', 'Downstream tasks may differ', 'Environmental costs not addressed']
    },
    citations: [
      { id: 'c5-1', title: 'Attention Is All You Need', authors: ['Ashish Vaswani'], year: 2017, journal: 'NeurIPS', pages: '5998-6008' },
      { id: 'c5-2', title: 'Language Models are Unsupervised Multitask Learners', authors: ['Alec Radford'], year: 2019, journal: 'OpenAI Technical Report' },
    ],
    keywords: ['scaling laws', 'language models', 'power laws', 'compute efficiency', 'neural scaling', 'model size'],
    color: COLORS[4],
    tags: autoTag(['scaling laws', 'language models'], 'transformer WebText autoregressive'),
    bookmarked: false,
  }
];

const _demoGraphEdges: { from: string; to: string; strength?: number }[] = [
  { from: 'paper-2', to: 'paper-1', strength: 3 },
  { from: 'paper-3', to: 'paper-1', strength: 2 },
  { from: 'paper-3', to: 'paper-2', strength: 2 },
  { from: 'paper-3', to: 'paper-5', strength: 3 },
  { from: 'paper-4', to: 'paper-1', strength: 3 },
  { from: 'paper-4', to: 'paper-2', strength: 1 },
  { from: 'paper-5', to: 'paper-1', strength: 2 },
];

export const samplePapers: Paper[] = DEMO_MODE ? _demoPapers : [];

export const sampleGraphEdges: { from: string; to: string; strength?: number }[] = DEMO_MODE ? _demoGraphEdges : [];

// Topic clusters for coloring
export const TOPIC_CLUSTERS: Record<string, { name: string; color: string; keywords: string[] }> = {
  'nlp': { name: 'NLP & Language', color: '#6366f1', keywords: ['NLP', 'language model', 'BERT', 'GPT', 'translation', 'text', 'pre-training', 'bidirectional', 'autoregressive'] },
  'vision': { name: 'Computer Vision', color: '#f59e0b', keywords: ['vision', 'image', 'ViT', 'CNN', 'classification', 'patch', 'computer vision'] },
  'scaling': { name: 'Scaling & Efficiency', color: '#10b981', keywords: ['scaling', 'efficiency', 'compute', 'power law', 'model size', 'parameters'] },
  'architecture': { name: 'Architecture', color: '#ec4899', keywords: ['transformer', 'attention', 'self-attention', 'encoder', 'decoder', 'architecture'] },
  'learning': { name: 'Learning Paradigms', color: '#8b5cf6', keywords: ['few-shot', 'transfer learning', 'in-context', 'fine-tuning', 'pre-training', 'unsupervised'] },
};

export function getClusterForPaper(paper: Paper): string {
  const allText = [...paper.keywords, paper.title].join(' ').toLowerCase();
  let bestCluster = 'architecture';
  let bestScore = 0;
  for (const [key, cluster] of Object.entries(TOPIC_CLUSTERS)) {
    const score = cluster.keywords.filter(kw => allText.includes(kw.toLowerCase())).length;
    if (score > bestScore) { bestScore = score; bestCluster = key; }
  }
  return bestCluster;
}

export function buildGraphData(papers: Paper[], edges: { from: string; to: string; strength?: number }[]): GraphData {
  const validIds = new Set(papers.map(p => p.id));
  const filteredEdges = edges.filter(e => validIds.has(e.from) && validIds.has(e.to));
  const citationCounts: Record<string, number> = {};
  papers.forEach(p => { citationCounts[p.id] = 0; });
  filteredEdges.forEach(e => { citationCounts[e.to] = (citationCounts[e.to] || 0) + 1; });

  const nodes = papers.map((p, i) => {
    const cluster = getClusterForPaper(p);
    return {
      id: p.id,
      label: p.title.length > 30 ? p.title.substring(0, 30) + '...' : p.title,
      color: TOPIC_CLUSTERS[cluster]?.color || p.color,
      size: 20 + (citationCounts[p.id] || 0) * 8,
      x: 300 + 200 * Math.cos((2 * Math.PI * i) / papers.length),
      y: 250 + 180 * Math.sin((2 * Math.PI * i) / papers.length),
      citationCount: citationCounts[p.id] || 0,
      cluster,
      year: p.year,
    };
  });

  // Force-directed layout
  for (let iter = 0; iter < 150; iter++) {
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const dx = nodes[b].x - nodes[a].x;
        const dy = nodes[b].y - nodes[a].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const repulsion = 8000 / (dist * dist);
        const fx = (dx / dist) * repulsion;
        const fy = (dy / dist) * repulsion;
        nodes[a].x -= fx; nodes[a].y -= fy;
        nodes[b].x += fx; nodes[b].y += fy;
      }
    }
    for (const edge of filteredEdges) {
      const a = nodes.find(n => n.id === edge.from);
      const b = nodes.find(n => n.id === edge.to);
      if (!a || !b) continue;
      const dx = b.x - a.x; const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const attraction = dist * 0.005;
      const fx = (dx / dist) * attraction; const fy = (dy / dist) * attraction;
      a.x += fx; a.y += fy; b.x -= fx; b.y -= fy;
    }
    const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
    const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
    nodes.forEach(n => { n.x += (350 - cx) * 0.05; n.y += (250 - cy) * 0.05; });
  }

  return { nodes, edges: filteredEdges };
}

export function buildConceptGraph(papers: Paper[]): ConceptGraphData {
  const conceptMap: Record<string, { paperIds: Set<string>; count: number }> = {};
  papers.forEach(p => {
    p.keywords.forEach(kw => {
      const key = kw.toLowerCase();
      if (!conceptMap[key]) conceptMap[key] = { paperIds: new Set(), count: 0 };
      conceptMap[key].paperIds.add(p.id);
      conceptMap[key].count++;
    });
  });

  const concepts = Object.entries(conceptMap).filter(([, v]) => v.count >= 1).sort((a, b) => b[1].count - a[1].count).slice(0, 15);
  const nodes = concepts.map(([label, data], i) => {
    let cluster = 'architecture';
    for (const [key, cl] of Object.entries(TOPIC_CLUSTERS)) {
      if (cl.keywords.some(kw => label.includes(kw.toLowerCase()))) { cluster = key; break; }
    }
    return {
      id: `concept-${i}`,
      label,
      color: TOPIC_CLUSTERS[cluster]?.color || '#6366f1',
      size: 15 + data.count * 6,
      x: 300 + 180 * Math.cos((2 * Math.PI * i) / concepts.length),
      y: 250 + 160 * Math.sin((2 * Math.PI * i) / concepts.length),
      paperIds: [...data.paperIds],
    };
  });

  const edges: { from: string; to: string; label: string }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const overlap = nodes[i].paperIds.filter(id => nodes[j].paperIds.includes(id));
      if (overlap.length > 0) {
        edges.push({ from: nodes[i].id, to: nodes[j].id, label: `${overlap.length} shared` });
      }
    }
  }
  return { nodes, edges };
}

export function buildTimelineData(papers: Paper[]): TimelineEntry[] {
  const years = [...new Set(papers.map(p => p.year))].sort();
  if (years.length === 0) return [];
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const entries: TimelineEntry[] = [];
  const seenTopics = new Set<string>();

  for (let y = minYear; y <= maxYear; y++) {
    const yearPapers = papers.filter(p => p.year === y);
    const yearTopics = new Set(yearPapers.flatMap(p => p.keywords));
    const newTopics = [...yearTopics].filter(t => !seenTopics.has(t));
    const deadTopics = [...seenTopics].filter(t => !yearTopics.has(t) && papers.filter(p => p.year <= y && p.keywords.includes(t)).length > 0);
    yearTopics.forEach(t => seenTopics.add(t));

    const clusters = new Set(yearPapers.map(p => getClusterForPaper(p)));
    entries.push({
      year: y,
      papers: yearPapers,
      clusterCount: clusters.size || 0,
      newTopics: newTopics.slice(0, 5),
      deadTopics: deadTopics.slice(0, 3),
    });
  }
  return entries;
}

const additionalPaperTemplates: Omit<Paper, 'id' | 'color'>[] = [
  {
    title: 'Generative Adversarial Networks',
    authors: ['Ian J. Goodfellow', 'Jean Pouget-Abadie', 'Mehdi Mirza'],
    year: 2014,
    abstract: 'We propose a new framework for estimating generative models via an adversarial process.',
    summary: {
      overview: 'GANs introduce adversarial training where two networks contest in a game, producing realistic synthetic data.',
      findings: ['Adversarial training produces high-quality generative models', 'No inference during generation', 'Framework generates sharp images', 'Theoretical convergence guarantees'],
      methodology: 'Generator maps noise to data space; discriminator distinguishes real from generated samples. Minimax optimization.',
      limitations: ['Mode collapse', 'Difficult quality evaluation', 'No density estimation', 'Requires careful tuning']
    },
    citations: [
      { id: 'cg-1', title: 'Auto-Encoding Variational Bayes', authors: ['Diederik P. Kingma', 'Max Welling'], year: 2014, journal: 'ICLR' },
    ],
    keywords: ['GAN', 'generative model', 'adversarial training', 'deep learning', 'image generation'],
    tags: [{ label: 'GAN', type: 'method', auto: true }, { label: 'generation', type: 'problem', auto: true }],
    bookmarked: false,
  },
  {
    title: 'Deep Residual Learning for Image Recognition',
    authors: ['Kaiming He', 'Xiangyu Zhang', 'Shaoqing Ren', 'Jian Sun'],
    year: 2016,
    abstract: 'We present a residual learning framework to ease training of substantially deeper networks.',
    summary: {
      overview: 'ResNet introduces skip connections enabling training of very deep networks, winning ILSVRC 2015.',
      findings: ['Residual connections solve degradation problem', '152-layer networks trainable', '3.57% ImageNet error', 'Skip connections enable gradient flow'],
      methodology: 'Learning residual functions F(x)+x with shortcut identity connections through deep layers.',
      limitations: ['Significant compute required', 'Feature reuse unexplored', 'Large architecture search space', 'Plateaus beyond certain depths']
    },
    citations: [
      { id: 'cr-1', title: 'ImageNet Classification with Deep CNNs', authors: ['Alex Krizhevsky'], year: 2012, journal: 'NeurIPS', pages: '1097-1105' },
    ],
    keywords: ['ResNet', 'residual learning', 'deep learning', 'image recognition', 'skip connections', 'CNN'],
    tags: [{ label: 'CNN', type: 'method', auto: true }, { label: 'ImageNet', type: 'dataset', auto: true }, { label: 'classification', type: 'problem', auto: true }],
    bookmarked: false,
  },
];

let paperCounter = 6;

export function simulateProcessPaper(fileName: string): Promise<Paper> {
	 if (!DEMO_MODE) {
    return Promise.reject(
      new Error('simulateProcessPaper disabled — backend must process papers')
    );
  }
  return new Promise((resolve) => {
    const template = additionalPaperTemplates[Math.floor(Math.random() * additionalPaperTemplates.length)];
    const id = `paper-${paperCounter++}`;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    setTimeout(() => {
      resolve({
        ...template,
        id,
        color,
        title: fileName.replace('.pdf', '').replace(/_/g, ' ').replace(/-/g, ' ') || template.title,
      });
    }, 2500);
  });
}

export function generateGapAnalysis(papers: Paper[], constraints?: GapConstraints): GapAnalysisResult {
  let filtered = papers;
  if (constraints) {
    if (constraints.yearRange) {
      filtered = filtered.filter(p => p.year >= constraints.yearRange[0] && p.year <= constraints.yearRange[1]);
    }
    if (constraints.methodology) {
      const meth = constraints.methodology.toLowerCase();
      filtered = filtered.filter(p => p.summary.methodology.toLowerCase().includes(meth) || p.tags.some(t => t.type === 'method' && t.label.toLowerCase().includes(meth)));
    }
    if (constraints.domainScope) {
      const domain = constraints.domainScope.toLowerCase();
      filtered = filtered.filter(p => p.keywords.some(k => k.toLowerCase().includes(domain)) || p.abstract.toLowerCase().includes(domain));
    }
  }
  if (filtered.length < 2) filtered = papers;

  const allKeywords = filtered.flatMap(p => p.keywords);
  const keywordFreq: Record<string, number> = {};
  allKeywords.forEach(k => { keywordFreq[k] = (keywordFreq[k] || 0) + 1; });
  const commonTopics = Object.entries(keywordFreq).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const uniqueTopics = Object.entries(keywordFreq).filter(([, c]) => c === 1).map(([t]) => t);

  const makeEvidence = (relatedPapers: Paper[], missingLink: string): EvidenceLink[] => {
    return relatedPapers.slice(0, 3).map(p => ({
      paperId: p.id,
      paperTitle: p.title,
      citationPath: [p.title, '→', 'related work'],
      missingLinks: [missingLink],
      explanation: `"${p.title}" addresses related topics but does not explore ${missingLink}.`,
    }));
  };

  const gaps: ResearchGap[] = [
    {
      topic: 'Cross-modal Transfer Learning',
      description: `While ${commonTopics.slice(0, 3).join(', ')} are covered, knowledge transfer across modalities (text↔image↔audio) remains underexplored.`,
      severity: 'high',
      evidence: makeEvidence(filtered.slice(0, 2), 'cross-modal transfer'),
    },
    {
      topic: 'Computational Efficiency',
      description: 'Papers focus on scaling up but efficient inference/training for resource-constrained environments is underexplored.',
      severity: 'high',
      evidence: makeEvidence(filtered.filter(p => p.keywords.some(k => k.includes('scaling') || k.includes('compute'))), 'efficient deployment'),
    },
    {
      topic: 'Interpretability and Explainability',
      description: 'Strong empirical results lack comprehensive internal analysis of model decisions.',
      severity: 'medium',
      evidence: makeEvidence(filtered.slice(1, 3), 'model interpretability'),
    },
    {
      topic: 'Bias and Fairness',
      description: 'Limited systematic evaluation of biases in pre-trained models.',
      severity: 'medium',
      evidence: makeEvidence(filtered.filter(p => p.keywords.some(k => k.includes('model') || k.includes('pre-training'))), 'bias evaluation'),
    },
    {
      topic: 'Low-Resource Scenarios',
      description: `${uniqueTopics.slice(0, 2).join(' and ')} discussed but low-resource languages/domains insufficiently addressed.`,
      severity: 'low',
      evidence: makeEvidence(filtered.slice(0, 1), 'low-resource application'),
    }
  ];

  const researchQuestions = [
    { question: 'How can Transformer models achieve comparable performance with significantly fewer parameters?', relevance: 'Addresses computational efficiency gap' },
    { question: 'What are the theoretical limits of in-context learning?', relevance: 'Builds on GPT-3 findings' },
    { question: 'How do scaling laws differ across modalities?', relevance: 'Connects scaling with multi-modal learning' },
    { question: 'What pre-training objectives best support cross-lingual transfer?', relevance: 'Extends BERT/ViT to underexplored scenarios' },
    { question: 'How can we develop reliable bias metrics for large pre-trained models?', relevance: 'Addresses fairness gap' },
    { question: 'What architectural modifications enable effective performance beyond current sequence limits?', relevance: 'Addresses O(n²) limitation' },
    { question: 'Can curriculum learning improve sample efficiency in scaling?', relevance: 'Connects training methodology with scaling' },
  ];

  const methodologyDifferences = [
    'Varying positional encoding approaches (sinusoidal vs. learned vs. rotary)',
    'Different pre-training objectives (MLM, autoregressive, contrastive)',
    'Inconsistent evaluation benchmarks across papers',
    'Different pre-training data scales (millions to billions of tokens)',
    'Varying architecture search and hyperparameter strategies',
  ];

  return { commonTopics, gaps, researchQuestions, methodologyDifferences };
}

export function generateInsightCards(papers: Paper[], edges: { from: string; to: string; strength?: number }[]): InsightCard[] {
  if (papers.length < 2) return [];
  const cards: InsightCard[] = [];

  // Find most cited
  const citeCounts: Record<string, number> = {};
  papers.forEach(p => { citeCounts[p.id] = 0; });
  edges.forEach(e => { if (citeCounts[e.to] !== undefined) citeCounts[e.to]++; });
  const mostCited = Object.entries(citeCounts).sort((a, b) => b[1] - a[1])[0];
  const mostCitedPaper = papers.find(p => p.id === mostCited?.[0]);
  if (mostCitedPaper && mostCited[1] > 1) {
    cards.push({
      id: 'insight-overcited',
      type: 'overcited',
      title: 'Overcited Foundation',
      description: `"${mostCitedPaper.title}" is cited by ${mostCited[1]} other papers — it's the backbone of this research area. Consider if newer alternatives exist.`,
      relatedPaperIds: [mostCitedPaper.id],
      graphHighlight: { nodeIds: [mostCitedPaper.id], edgeKeys: edges.filter(e => e.to === mostCitedPaper.id).map(e => `${e.from}-${e.to}`) },
      icon: '🔥',
      color: '#ef4444',
    });
  }

  // Find papers with no outgoing citations in graph
  const citing = new Set(edges.map(e => e.from));
  const uncited = papers.filter(p => !citing.has(p.id) && citeCounts[p.id] === 0);
  if (uncited.length > 0) {
    cards.push({
      id: 'insight-isolated',
      type: 'underexplored',
      title: 'Isolated Research',
      description: `"${uncited[0].title}" has no citation connections to other papers in the graph. It may represent an underexplored angle.`,
      relatedPaperIds: uncited.map(p => p.id),
      graphHighlight: { nodeIds: uncited.map(p => p.id), edgeKeys: [] },
      icon: '🔍',
      color: '#6366f1',
    });
  }

  // Emerging subfield — newest paper cluster
  const newest = [...papers].sort((a, b) => b.year - a.year)[0];
  if (newest) {
    const newestKeywords = newest.keywords.filter(k => papers.filter(p => p.id !== newest.id && p.keywords.includes(k)).length === 0);
    if (newestKeywords.length > 0) {
      cards.push({
        id: 'insight-emerging',
        type: 'emerging',
        title: 'Emerging Subfield',
        description: `"${newest.title}" (${newest.year}) introduces concepts not seen in earlier papers: ${newestKeywords.slice(0, 3).join(', ')}. This may signal an emerging research direction.`,
        relatedPaperIds: [newest.id],
        icon: '🌱',
        color: '#10b981',
      });
    }
  }

  // Underexplored connection
  const allPairs: [string, string][] = [];
  for (let i = 0; i < papers.length; i++) {
    for (let j = i + 1; j < papers.length; j++) {
      const sharedKeywords = papers[i].keywords.filter(k => papers[j].keywords.includes(k));
      if (sharedKeywords.length > 0 && !edges.some(e => (e.from === papers[i].id && e.to === papers[j].id) || (e.from === papers[j].id && e.to === papers[i].id))) {
        allPairs.push([papers[i].id, papers[j].id]);
      }
    }
  }
  if (allPairs.length > 0) {
    const [a, b] = allPairs[0];
    const pa = papers.find(p => p.id === a)!;
    const pb = papers.find(p => p.id === b)!;
    cards.push({
      id: 'insight-connection',
      type: 'underexplored',
      title: 'Underexplored Connection',
      description: `"${pa.title}" and "${pb.title}" share keywords but don't cite each other. Connecting them could yield novel insights.`,
      relatedPaperIds: [a, b],
      graphHighlight: { nodeIds: [a, b], edgeKeys: [] },
      icon: '🧩',
      color: '#8b5cf6',
    });
  }

  // Stagnation detection
  const yearGroups: Record<number, Paper[]> = {};
  papers.forEach(p => { (yearGroups[p.year] ??= []).push(p); });
  const years = Object.keys(yearGroups).map(Number).sort();
  if (years.length >= 2) {
    const lastYear = years[years.length - 1];
    const prevYear = years[years.length - 2];
    if (lastYear - prevYear >= 2) {
      cards.push({
        id: 'insight-stagnation',
        type: 'stagnation',
        title: 'Publication Gap Detected',
        description: `There's a ${lastYear - prevYear}-year gap between publications (${prevYear}→${lastYear}). This could indicate a stagnation period or a paradigm shift.`,
        relatedPaperIds: [...(yearGroups[prevYear] || []), ...(yearGroups[lastYear] || [])].map(p => p.id),
        icon: '⏸️',
        color: '#f59e0b',
      });
    }
  }

  return cards;
}

export function generateExplainableInsight(suggestion: string, papers: Paper[], edges: { from: string; to: string; strength?: number }[]): ExplainableInsight {
  const citeCounts: Record<string, { inDeg: number; outDeg: number }> = {};
  papers.forEach(p => { citeCounts[p.id] = { inDeg: 0, outDeg: 0 }; });
  edges.forEach(e => {
    if (citeCounts[e.from]) citeCounts[e.from].outDeg++;
    if (citeCounts[e.to]) citeCounts[e.to].inDeg++;
  });

  const allKeywords = papers.flatMap(p => p.keywords);
  const kwFreq: Record<string, number> = {};
  allKeywords.forEach(k => { kwFreq[k] = (kwFreq[k] || 0) + 1; });
  const repeatedKeywords = Object.entries(kwFreq).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).map(([keyword, count]) => ({ keyword, count }));

  const topPapers = [...papers].sort((a, b) => (citeCounts[b.id]?.inDeg || 0) - (citeCounts[a.id]?.inDeg || 0)).slice(0, 3).map(p => ({
    id: p.id,
    title: p.title,
    weight: citeCounts[p.id]?.inDeg || 0,
  }));

  const imbalance = papers.map(p => ({
    paperId: p.id,
    title: p.title,
    inDegree: citeCounts[p.id]?.inDeg || 0,
    outDegree: citeCounts[p.id]?.outDeg || 0,
  })).filter(p => Math.abs(p.inDegree - p.outDegree) >= 2);

  return {
    suggestion,
    topInfluencingPapers: topPapers,
    repeatedKeywords: repeatedKeywords.slice(0, 6),
    citationImbalance: imbalance,
    reasoning: `This suggestion is based on analyzing ${papers.length} papers with ${edges.length} citation links. The most influential paper ("${topPapers[0]?.title || 'N/A'}") with ${topPapers[0]?.weight || 0} incoming citations heavily shapes the research direction. Keywords like "${repeatedKeywords[0]?.keyword || 'N/A'}" appear across ${repeatedKeywords[0]?.count || 0} papers, indicating strong thematic convergence. ${imbalance.length > 0 ? `Citation imbalance detected in ${imbalance.length} paper(s), suggesting some foundational works may be over-relied upon.` : 'Citation flow is relatively balanced.'}`,
  };
}

export function formatCitation(citation: Citation, format: 'APA' | 'MLA' | 'IEEE' | 'BibTeX'): string {
  const authorsStr = citation.authors.join(', ');
  const firstAuthorLast = citation.authors[0]?.split(' ').pop() || '';
  const firstAuthorInitials = citation.authors[0]?.split(' ').slice(0, -1).map(n => n[0] + '.').join(' ') || '';
  switch (format) {
    case 'APA': {
      const apaAuthors = citation.authors.map(a => { const parts = a.split(' '); const last = parts.pop(); const initials = parts.map(p => p[0] + '.').join(' '); return `${last}, ${initials}`; }).join(', ');
      let result = `${apaAuthors} (${citation.year}). ${citation.title}. *${citation.journal}*`;
      if (citation.volume) result += `, *${citation.volume}*`;
      if (citation.issue) result += `(${citation.issue})`;
      if (citation.pages) result += `, ${citation.pages}`;
      result += '.';
      if (citation.doi) result += ` https://doi.org/${citation.doi}`;
      return result;
    }
    case 'MLA': {
      let result = `${authorsStr}. "${citation.title}." *${citation.journal}*`;
      if (citation.volume) result += `, vol. ${citation.volume}`;
      if (citation.issue) result += `, no. ${citation.issue}`;
      result += `, ${citation.year}`;
      if (citation.pages) result += `, pp. ${citation.pages}`;
      result += '.';
      return result;
    }
    case 'IEEE': {
      let result = `${firstAuthorInitials} ${firstAuthorLast}`;
      if (citation.authors.length > 1) result += ' et al.';
      result += `, "${citation.title}," *${citation.journal}*`;
      if (citation.volume) result += `, vol. ${citation.volume}`;
      if (citation.issue) result += `, no. ${citation.issue}`;
      if (citation.pages) result += `, pp. ${citation.pages}`;
      result += `, ${citation.year}.`;
      return result;
    }
    case 'BibTeX': {
      const key = `${firstAuthorLast.toLowerCase()}${citation.year}`;
      return `@article{${key},\n  author = {${authorsStr}},\n  title = {${citation.title}},\n  journal = {${citation.journal}},\n  year = {${citation.year}}${citation.volume ? `,\n  volume = {${citation.volume}}` : ''}${citation.pages ? `,\n  pages = {${citation.pages}}` : ''}${citation.doi ? `,\n  doi = {${citation.doi}}` : ''}\n}`;
    }
  }
}