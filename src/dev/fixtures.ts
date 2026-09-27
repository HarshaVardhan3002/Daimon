import type { AnswerSource } from '../state/types';

/**
 * Review-only sample data, shown only when Settings → Developer → Preview fixtures is on. Nothing here is sent,
 * stored in a chat or shown to participants by default. Every surface that shows it also shows a "Preview" label.
 */
export const previewSources: AnswerSource[] = [
  { id: 'w1', kind: 'web', title: 'How do bacteria spoil food?', domain: 'usda.gov', url: 'https://www.usda.gov', cited: true },
  { id: 'w2', kind: 'web', title: 'Cheese: storage and safety', domain: 'bfr.bund.de', url: 'https://www.bfr.bund.de', cited: true },
  { id: 'c1', kind: 'chat', title: 'Earlier chat: meal prep for the week', cited: false },
  { id: 'w3', kind: 'web', title: 'What foods are perishable?', domain: 'fsis.usda.gov', url: 'https://www.fsis.usda.gov', cited: false },
];

export const previewThinking = 'Checked which part of the question needs a definition first, compared two ways to explain it, and chose the one with a concrete example.';
