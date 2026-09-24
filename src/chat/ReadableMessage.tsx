import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { parseInlineMarkdown, parseMarkdownBlocks, tokenizeCode } from './markdown';

type Palette = { text: string; muted: string; raised: string; accent: string; surface?: string };

const codeColors: Record<string, string> = {
  plain: '#E6E6E7', keyword: '#52D4E4', function: '#E5D85C', string: '#A6E22E', number: '#AE81FF',
  comment: '#7D8590', key: '#F07178', literal: '#FFCB6B',
};

function InlineText({ text, color, palette, fontSize = 16, lineHeight = 25 }: { text: string; color: string; palette: Palette; fontSize?: number; lineHeight?: number }) {
  const pieces = parseInlineMarkdown(text);
  return <Text selectable style={{ color, fontFamily: 'Inter_400Regular', fontSize, lineHeight }}>{pieces.map((piece, index) => {
    if (piece.kind === 'bold') return <Text key={index} style={{ fontFamily: 'Inter_600SemiBold' }}>{piece.text}</Text>;
    if (piece.kind === 'code') return <Text key={index} style={{ color: palette.accent, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14 }}>{piece.text}</Text>;
    if (piece.kind === 'italic') return <Text key={index} style={{ fontStyle: 'italic' }}>{piece.text}</Text>;
    if (piece.kind === 'link' && piece.url) return <Text key={index} accessibilityRole="link" onPress={() => void Linking.openURL(piece.url!)} style={{ color: palette.accent, textDecorationLine: 'underline' }}>{piece.text}</Text>;
    return <Text key={index}>{piece.text}</Text>;
  })}</Text>;
}

function CodeBlock({ code, language, palette }: { code: string; language?: string; palette: Palette }) {
  const tokens = tokenizeCode(code, language);
  return <View style={{ marginHorizontal: -20, position: 'relative', marginBottom: 16, overflow: 'hidden', borderRadius: 18, backgroundColor: palette.surface ?? palette.raised }}>
    <Pressable onPress={() => void Clipboard.setStringAsync(code)} accessibilityRole="button" accessibilityLabel="Copy code" hitSlop={5} style={{ position: 'absolute', zIndex: 1, top: 7, right: 7, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}><Feather name="copy" size={17} color={palette.muted} /></Pressable>
    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 13, paddingRight: 52, paddingBottom: 16 }}>
      <Text selectable style={{ color: codeColors.plain, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14, lineHeight: 23 }}>{tokens.map((token, index) => <Text key={index} style={{ color: codeColors[token.tone] }}>{token.text}</Text>)}</Text>
    </ScrollView>
  </View>;
}

function MarkdownTable({ rows, palette }: { rows: string[][]; palette: Palette }) {
  const columnCount = Math.max(1, ...rows.map(row => row.length));
  const widths = Array.from({ length: columnCount }, (_, column) => Math.min(240, Math.max(72, ...rows.map(row => Math.min(240, (row[column]?.length ?? 0) * 7.2 + 20)))));
  return <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator contentContainerStyle={{ marginBottom: 16 }}>
    <View>
      {rows.map((row, rowIndex) => <View key={rowIndex} style={{ minHeight: 48, flexDirection: 'row', borderBottomWidth: rowIndex < rows.length - 1 ? 1 : 0, borderBottomColor: palette.muted + '55' }}>
        {Array.from({ length: columnCount }, (_, column) => <View key={column} style={{ width: widths[column], paddingHorizontal: 10, paddingVertical: 11, justifyContent: 'center' }}><InlineText text={row[column] ?? ''} color={palette.text} palette={palette} fontSize={15} lineHeight={22} /></View>)}
      </View>)}
    </View>
  </ScrollView>;
}

/** Small native Markdown subset for model text; never renders HTML or WebView content. */
export function ReadableMessage({ text, palette }: { text: string; palette: Palette }) {
  const blocks = parseMarkdownBlocks(text);
  return <View>{blocks.map((block, index) => {
    if (block.kind === 'heading') { const size = block.level === 1 ? 21 : block.level === 2 ? 19 : 17; return <View key={index} style={{ marginTop: index ? 5 : 0, marginBottom: 8 }}><InlineText text={block.text} color={palette.text} palette={palette} fontSize={size} lineHeight={size + 7} /></View>; }
    if (block.kind === 'list') return <View key={index} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 2, marginBottom: 5 }}><Text style={{ width: 25, color: palette.text, fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 25 }}>{block.marker}</Text><View style={{ flex: 1 }}><InlineText text={block.text} color={palette.text} palette={palette} /></View></View>;
    if (block.kind === 'quote') return <View key={index} style={{ marginBottom: 12, paddingLeft: 13, borderLeftWidth: 3, borderLeftColor: palette.muted }}><InlineText text={block.text} color={palette.muted} palette={palette} /></View>;
    if (block.kind === 'code') return <CodeBlock key={index} code={block.text} language={block.language} palette={palette} />;
    if (block.kind === 'table') return <MarkdownTable key={index} rows={block.rows} palette={palette} />;
    return <View key={index} style={{ marginBottom: 12 }}><InlineText text={block.text} color={palette.text} palette={palette} /></View>;
  })}</View>;
}
