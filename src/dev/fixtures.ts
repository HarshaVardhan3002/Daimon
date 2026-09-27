import type { AnswerSource } from '../state/types';
import type { LessonDeck } from '../learning/deck';

/**
 * Review-only sample data, shown only when Settings → Developer → Preview fixtures is on. Nothing here is sent,
 * shown to participants by default. The explicit lesson demo is saved in its chat, with a Preview label.
 */
export const previewSources: AnswerSource[] = [
  { id: 'w1', kind: 'web', title: 'How do bacteria spoil food?', domain: 'usda.gov', url: 'https://www.usda.gov', cited: true },
  { id: 'w2', kind: 'web', title: 'Cheese: storage and safety', domain: 'bfr.bund.de', url: 'https://www.bfr.bund.de', cited: true },
  { id: 'c1', kind: 'chat', title: 'Earlier chat: meal prep for the week', cited: false },
  { id: 'w3', kind: 'web', title: 'What foods are perishable?', domain: 'fsis.usda.gov', url: 'https://www.fsis.usda.gov', cited: false },
];

export const previewThinking = 'Checked which part of the question needs a definition first, compared two ways to explain it, and chose the one with a concrete example.';

/** Dev-only, one of every format; no model request is made for the exact `lesson demo` prompt. */
export function previewLesson(locale: 'en' | 'de'): LessonDeck {
  if (locale === 'de') return {
    title: 'Schwarze Löcher · Preview',
    cards: [
      { kind: 'idea', id: 'horizon', anchor: 'c', title: 'Eine Grenze ohne Rückweg', body: 'Der Ereignishorizont ist die Grenze eines schwarzen Lochs. Von innerhalb dieser Grenze kann kein Signal nach außen gelangen, auch kein Licht.' },
      { kind: 'flip', id: 'light', front: 'Kann Licht aus dem Inneren des Ereignishorizonts entkommen?', back: 'Nein. Innerhalb des Ereignishorizonts führen alle zukünftigen Wege weiter nach innen.' },
      { kind: 'mcq', id: 'mass', prompt: 'Die Sonne würde durch ein schwarzes Loch gleicher Masse ersetzt. Was geschähe mit der Erdbahn?', options: ['Sie bliebe annähernd gleich.', 'Die Erde würde sofort eingesaugt.', 'Die Erde würde wegfliegen.'], answerIndex: 0, why: 'In dieser Entfernung wirkt dieselbe Schwerkraft. Die Erde würde allerdings Licht und Wärme verlieren.', confidence: true },
      { kind: 'swipe', id: 'vacuum', statement: 'Schwarze Löcher saugen alles im Universum ein.', isTrue: false, why: 'In großer Entfernung wirkt ihre Schwerkraft wie die anderer Objekte gleicher Masse. Objekte können sie umkreisen.' },
      { kind: 'cloze', id: 'boundary', before: 'Die Grenze ohne Rückweg heißt', after: '.', answer: 'Ereignishorizont', distractors: ['Akkretionsscheibe', 'Sternhaufen'] },
      { kind: 'order', id: 'formation', prompt: 'Ordne einen möglichen Entstehungsweg eines stellaren schwarzen Lochs.', steps: ['Ein massereicher Stern verbraucht seinen Kernbrennstoff.', 'Der Kern kollabiert unter seiner Schwerkraft.', 'Ist der verbleibende Kern massereich genug, entsteht ein schwarzes Loch.'] },
      { kind: 'match', id: 'terms', prompt: 'Verbinde die Begriffe.', pairs: [['Ereignishorizont', 'Grenze ohne Rückweg'], ['Akkretionsscheibe', 'Heißes, umlaufendes Gas'], ['Gravitationswellen', 'Wellen in der Raumzeit']] },
    ],
  };
  return {
    title: 'Black holes · Preview',
    cards: [
      { kind: 'idea', id: 'horizon', anchor: 'c', title: 'A boundary with no return', body: 'The event horizon is the boundary of a black hole. From inside this boundary, no signal can reach the outside, including light.' },
      { kind: 'flip', id: 'light', front: 'Can light escape from inside the event horizon?', back: 'No. Inside the event horizon, all future paths lead farther inward.' },
      { kind: 'mcq', id: 'mass', prompt: 'If the Sun became a black hole of the same mass, what would happen to Earth’s orbit?', options: ['It would stay roughly the same.', 'Earth would be sucked in immediately.', 'Earth would fly away.'], answerIndex: 0, why: 'At this distance the gravitational pull is the same. Earth would lose sunlight and warmth, though.', confidence: true },
      { kind: 'swipe', id: 'vacuum', statement: 'Black holes suck in everything in the universe.', isTrue: false, why: 'Far away, their gravity acts like that of any object of the same mass. Objects can orbit them.' },
      { kind: 'cloze', id: 'boundary', before: 'The boundary of no return is the', after: '.', answer: 'event horizon', distractors: ['accretion disk', 'star cluster'] },
      { kind: 'order', id: 'formation', prompt: 'Arrange one possible route to a stellar black hole.', steps: ['A massive star exhausts its core fuel.', 'Its core collapses under gravity.', 'If the remaining core is massive enough, a black hole forms.'] },
      { kind: 'match', id: 'terms', prompt: 'Connect the terms.', pairs: [['Event horizon', 'Boundary of no return'], ['Accretion disk', 'Hot orbiting gas'], ['Gravitational waves', 'Ripples in spacetime']] },
    ],
  };
}
