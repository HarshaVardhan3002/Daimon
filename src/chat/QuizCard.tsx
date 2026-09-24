import { Feather, Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { getQuizCardAdvanceAction, getQuizCardAnswerFeedback, runQuizCardAdvanceAction } from './quizCardBehavior';
import type { QuizCardQuestion, ValidatedQuizCardData } from './quizCardData';

export type QuizCardProps = Readonly<{
  data: ValidatedQuizCardData;
  currentIndex: number;
  answers: Readonly<Record<string, string | undefined>>;
  completed: boolean;
  onAnswerChange: (questionId: string, choiceId: string) => void;
  onIndexChange: (index: number) => void;
  onComplete: () => void;
  /** Optional styling override for embedding in either app color mode. */
  palette?: Readonly<{
    text: string;
    muted: string;
    surface: string;
    line: string;
    accent: string;
    correct: string;
    incorrect: string;
  }>;
}>;

const defaultPalette = {
  text: '#F7F7F5',
  muted: '#858585',
  surface: '#0D0D0D',
  line: '#252525',
  accent: '#D8D8D8',
  correct: '#6CCB8A',
  incorrect: '#EF7777',
};

/** Interactive, controlled quiz response card for a generic chat conversation. */
export function QuizCard({ data, currentIndex, answers, completed, onAnswerChange, onIndexChange, onComplete, palette = defaultPalette }: QuizCardProps) {
  const questions = data.questions;
  const question = questions[currentIndex];
  const [explanationOpen, setExplanationOpen] = useState(false);

  if (!question || questions.length === 0) return null;

  const selectedId = answers[question.id];
  const feedbackForSelection = getQuizCardAnswerFeedback(question, selectedId, completed);
  const isLast = currentIndex === questions.length - 1;
  const footerAction = getQuizCardAdvanceAction(question, currentIndex, questions.length, selectedId, completed);
  const canAdvance = footerAction === 'next' || footerAction === 'complete';
  const hasExplanation = completed && Boolean(question.explanation?.trim());
  const darkCanvas = palette.surface.toLowerCase() === '#000000';
  const cardSurface = darkCanvas ? '#0D0D0D' : palette.surface;
  const cardLine = darkCanvas ? '#252525' : palette.line;

  const copyText = [
    question.prompt,
    ...question.choices.map((choice, index) => `${String.fromCharCode(65 + index)}. ${choice.text}`),
  ].join('\n');

  const navigate = (index: number) => {
    if (index < 0 || index >= questions.length) return;
    setExplanationOpen(false);
    onIndexChange(index);
  };

  const handleNext = () => {
    runQuizCardAdvanceAction(footerAction, {
      onNext: () => navigate(currentIndex + 1),
      onComplete,
    });
  };

  const renderChoice = (choice: QuizCardQuestion['choices'][number], index: number) => {
    const isSelected = selectedId === choice.id;
    const feedback = getQuizCardAnswerFeedback(question, selectedId, completed);
    const selectedCorrect = Boolean(feedback?.selectedIsCorrect && isSelected);
    const selectedIncorrect = Boolean(feedback && !feedback.selectedIsCorrect && isSelected);
    const correctAnswerRevealed = feedback?.correctChoiceIndex === index;
    const label = String.fromCharCode(65 + index);
    const resultColor = selectedCorrect || correctAnswerRevealed ? palette.correct : selectedIncorrect ? palette.incorrect : palette.accent;

    return <Pressable
      key={choice.id}
      onPress={() => onAnswerChange(question.id, choice.id)}
      accessibilityRole="radio"
      accessibilityLabel={`Answer ${label}: ${choice.text}`}
      accessibilityState={{ checked: isSelected }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: 9, opacity: pressed ? 0.72 : 1 })}
    >
      <View style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, borderColor: isSelected || correctAnswerRevealed ? resultColor : cardLine, backgroundColor: isSelected || correctAnswerRevealed ? `${resultColor}18` : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 20 }}>
        <Text style={{ color: isSelected || correctAnswerRevealed ? resultColor : palette.text, fontFamily: 'Inter_400Regular', fontSize: 19 }}>{label}</Text>
      </View>
      <Text style={{ flex: 1, color: selectedCorrect || correctAnswerRevealed ? palette.correct : palette.text, fontFamily: 'Inter_400Regular', fontSize: 18, lineHeight: 27 }}>{choice.text}</Text>
      {selectedCorrect || (correctAnswerRevealed && !isSelected) ? <Feather name="check-circle" size={20} color={palette.correct} style={{ marginLeft: 10 }} /> : null}
      {selectedIncorrect ? <Feather name="x-circle" size={20} color={palette.incorrect} style={{ marginLeft: 10 }} /> : null}
    </Pressable>;
  };

  return <View style={{ marginHorizontal: -7, borderRadius: 25, borderWidth: 1, borderColor: cardLine, backgroundColor: cardSurface, paddingHorizontal: 31, paddingTop: 16, paddingBottom: 19 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, marginBottom: 16 }}>
      <Pressable
        onPress={() => navigate(currentIndex - 1)}
        disabled={currentIndex === 0}
        accessibilityRole="button"
        accessibilityLabel="Previous question"
        accessibilityState={{ disabled: currentIndex === 0 }}
        hitSlop={4}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: currentIndex === 0 ? 0.35 : 1 }}
      ><Feather name="chevron-left" size={25} color={palette.text} /></Pressable>
      <Text accessibilityLiveRegion="polite" style={{ color: palette.muted, fontFamily: 'Inter_400Regular', fontSize: 16, minWidth: 54, textAlign: 'center' }}>{currentIndex + 1} of {questions.length}</Text>
      <Pressable
        onPress={handleNext}
        disabled={!canAdvance}
        accessibilityRole="button"
        accessibilityLabel={isLast ? 'Finish quiz' : 'Next question'}
        accessibilityState={{ disabled: !canAdvance }}
        hitSlop={4}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: canAdvance ? 1 : 0.35 }}
      ><Feather name="chevron-right" size={25} color={palette.text} /></Pressable>
      <View style={{ flex: 1 }} />
      {hasExplanation ? <Pressable
        onPress={() => setExplanationOpen(open => !open)}
        accessibilityRole="button"
        accessibilityLabel={explanationOpen ? 'Hide explanation' : 'Show explanation'}
        accessibilityState={{ expanded: explanationOpen }}
        hitSlop={3}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      ><Ionicons name="bulb-outline" size={22} color={palette.muted} /></Pressable> : null}
      <Pressable
        onPress={() => void Clipboard.setStringAsync(copyText)}
        accessibilityRole="button"
        accessibilityLabel="Copy question and answers"
        hitSlop={3}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      ><Feather name="copy" size={20} color={palette.muted} /></Pressable>
    </View>

    <Text accessibilityRole="header" style={{ color: palette.text, fontFamily: 'Inter_400Regular', fontSize: 21, lineHeight: 31, marginBottom: 26 }}>{question.prompt}</Text>

    <View accessibilityRole="radiogroup" accessibilityLabel="Answer choices" style={{ marginBottom: 16 }}>
      {question.choices.map(renderChoice)}
    </View>

    {completed && selectedId !== undefined && feedbackForSelection ? <Text accessibilityLiveRegion="polite" style={{ color: feedbackForSelection.selectedIsCorrect ? palette.correct : palette.incorrect, fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, marginBottom: 10 }}>
      {feedbackForSelection.selectedIsCorrect ? 'Correct' : `The correct answer is ${String.fromCharCode(65 + feedbackForSelection.correctChoiceIndex)}.`}
    </Text> : null}

    {explanationOpen && hasExplanation ? <Text style={{ color: palette.muted, fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, marginBottom: 16 }}>{question.explanation}</Text> : null}

    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 2 }}>
      <Pressable
        onPress={handleNext}
        disabled={!canAdvance}
        accessibilityRole="button"
        accessibilityLabel={isLast ? 'Finish quiz' : 'Next'}
        accessibilityState={{ disabled: !canAdvance }}
        style={({ pressed }) => ({ minWidth: 92, minHeight: 48, paddingHorizontal: 21, borderRadius: 24, borderWidth: 1, borderColor: cardLine, backgroundColor: cardSurface, alignItems: 'center', justifyContent: 'center', opacity: !canAdvance ? 0.45 : pressed ? 0.7 : 1 })}
      ><Text style={{ color: canAdvance ? palette.text : palette.muted, fontFamily: 'Inter_400Regular', fontSize: 17 }}>{isLast ? 'Done' : 'Next'}</Text></Pressable>
    </View>
  </View>;
}

export default QuizCard;
