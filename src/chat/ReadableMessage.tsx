import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import React, { memo, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { font } from '../design/tokens';
import { useStrings } from '../i18n/strings';
import { haptic } from '../ui/PressableScale';
import { track } from '../telemetry/telemetry';
import { CopyCheck } from '../ui/icons';
import { parseInlineMarkdown, parseMarkdownBlocks, tokenizeCode } from './markdown';

type Palette = { text: string; muted: string; raised: string; accent: string; line?: string };

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
// Code keeps a dark surface in both themes; the token colours are tuned for it.
const CODE = { background: '#0F1019', header: '#1A1C2A', label: '#A4A6B9' };
const codeColors: Record<string, string> = {
  plain: '#E6E6E7', keyword: '#52D4E4', function: '#E5D85C', string: '#A6E22E', number: '#AE81FF',
  comment: '#7D8590', key: '#F07178', literal: '#FFCB6B',
};

function InlineText({ text, color, palette, fontSize = 16, lineHeight = 26, bold }: { text: string; color: string; palette: Palette; fontSize?: number; lineHeight?: number; bold?: boolean }) {
  const pieces = useMemo(() => parseInlineMarkdown(text), [text]);
  return <Text selectable style={{ color, fontFamily: bold ? font.semibold : font.regular, fontSize, lineHeight }}>{pieces.map((piece, index) => {
    if (piece.kind === 'bold') return <Text key={index} style={{ fontFamily: font.semibold }}>{piece.text}</Text>;
    if (piece.kind === 'code') return <Text key={index} style={{ fontFamily: MONO, fontSize: fontSize - 2, backgroundColor: palette.raised, color: palette.text }}>{` ${piece.text} `}</Text>;
    if (piece.kind === 'italic') return <Text key={index} style={{ fontStyle: 'italic' }}>{piece.text}</Text>;
    if (piece.kind === 'link' && piece.url) return <Text key={index} accessibilityRole="link" onPress={() => void Linking.openURL(piece.url!)} style={{ color: palette.accent, textDecorationLine: 'underline' }}>{piece.text}</Text>;
    return <Text key={index}>{piece.text}</Text>;
  })}</Text>;
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const tokens = useMemo(() => tokenizeCode(code, language), [code, language]);
  const t = useStrings();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void Clipboard.setStringAsync(code).then(() => { haptic('success'); track('reply_copy', { target: 'code' }); setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => undefined);
  };
  return <View style={{ marginBottom: 16, overflow: 'hidden', borderRadius: 16, backgroundColor: CODE.background }}>
    <View style={{ height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 14, backgroundColor: CODE.header }}>
      <Text style={{ color: CODE.label, fontFamily: font.medium, fontSize: 12 }}>{language || 'code'}</Text>
      <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel={language ? `${t.copy}: ${language}` : t.copy} hitSlop={4} style={{ height: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CopyCheck done={copied} size={15} color={CODE.label} />
        <Text style={{ color: CODE.label, fontFamily: font.medium, fontSize: 12 }}>{copied ? t.copied : t.copy}</Text>
      </Pressable>
    </View>
    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 }}>
      <Text selectable style={{ color: codeColors.plain, fontFamily: MONO, fontSize: 13.5, lineHeight: 21 }}>{tokens.map((token, index) => <Text key={index} style={{ color: codeColors[token.tone] }}>{token.text}</Text>)}</Text>
    </ScrollView>
  </View>;
}

function MarkdownTable({ rows, palette }: { rows: string[][]; palette: Palette }) {
  const columnCount = Math.max(1, ...rows.map(row => row.length));
  const widths = Array.from({ length: columnCount }, (_, column) => Math.min(240, Math.max(72, ...rows.map(row => Math.min(240, (row[column]?.length ?? 0) * 7.2 + 20)))));
  return <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator contentContainerStyle={{ marginBottom: 16 }}>
    <View>
      {rows.map((row, rowIndex) => <View key={rowIndex} style={{ minHeight: 44, flexDirection: 'row', borderBottomWidth: rowIndex < rows.length - 1 ? 1 : 0, borderBottomColor: palette.line ?? palette.muted + '55' }}>
        {Array.from({ length: columnCount }, (_, column) => <View key={column} style={{ width: widths[column], paddingHorizontal: 10, paddingVertical: 10, justifyContent: 'center' }}><InlineText text={row[column] ?? ''} color={palette.text} palette={palette} fontSize={15} lineHeight={22} bold={rowIndex === 0} /></View>)}
      </View>)}
    </View>
  </ScrollView>;
}

const REVEAL_STEP_MS = 35;
const REVEAL_MAX_DELAY_MS = 280;

/**
 * Small native Markdown subset for model text; never renders HTML or WebView content.
 * With `reveal`, blocks fade up one after another the first time an answer appears.
 */
export const ReadableMessage = memo(function ReadableMessage({ text, palette, reveal = false }: { text: string; palette: Palette; reveal?: boolean }) {
  const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);
  return <View>{blocks.map((block, index) => {
    let content: React.ReactNode;
    if (block.kind === 'heading') { const size = block.level === 1 ? 22 : block.level === 2 ? 19 : 17; content = <View style={{ marginTop: index ? 8 : 0, marginBottom: 8 }}><InlineText text={block.text} color={palette.text} palette={palette} fontSize={size} lineHeight={size + 8} bold /></View>; }
    else if (block.kind === 'list') content = <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 4, marginBottom: 6 }}><Text style={{ width: 24, color: palette.text, fontFamily: font.regular, fontSize: 16, lineHeight: 26 }}>{/^\d/.test(block.marker) ? block.marker : '•'}</Text><View style={{ flex: 1 }}><InlineText text={block.text} color={palette.text} palette={palette} /></View></View>;
    else if (block.kind === 'quote') content = <View style={{ marginBottom: 12, paddingLeft: 13, borderLeftWidth: 3, borderLeftColor: palette.muted }}><InlineText text={block.text} color={palette.muted} palette={palette} /></View>;
    else if (block.kind === 'code') content = <CodeBlock code={block.text} language={block.language} />;
    else if (block.kind === 'table') content = <MarkdownTable rows={block.rows} palette={palette} />;
    else content = <View style={{ marginBottom: 14 }}><InlineText text={block.text} color={palette.text} palette={palette} /></View>;
    if (!reveal) return <View key={index}>{content}</View>;
    const delay = Math.min(REVEAL_MAX_DELAY_MS, index * REVEAL_STEP_MS);
    return <Animated.View key={index} entering={index === 0 ? FadeIn.duration(220) : FadeInDown.delay(delay).duration(240).withInitialValues({ opacity: 0, transform: [{ translateY: 4 }] })}>{content}</Animated.View>;
  })}</View>;
});
