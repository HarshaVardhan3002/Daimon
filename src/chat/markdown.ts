export type MarkdownBlock =
  | { kind: 'heading'; text: string; level: number }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; text: string; marker: string }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string; language?: string }
  | { kind: 'table'; rows: string[][] };

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cell = '';
  let escaped = false;
  for (const char of trimmed) {
    if (char === '|' && !escaped) { cells.push(cell.trim()); cell = ''; }
    else if (char === '\\' && !escaped) { cell += char; escaped = true; }
    else { cell += char; escaped = false; }
  }
  cells.push(cell.trim());
  return cells.map(value => value.replace(/\\\|/g, '|'));
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')));
}

/** Parse a small Markdown subset into safe, platform-neutral text blocks. */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  const flushParagraph = () => {
    const text = paragraph.join(' ').trim();
    if (text) blocks.push({ kind: 'paragraph', text });
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^\s*```([\w.+#-]*)\s*$/);
    if (fence) {
      flushParagraph();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) codeLines.push(lines[index++]);
      blocks.push({ kind: 'code', text: codeLines.join('\n'), language: fence[1] || undefined });
      continue;
    }
    if (!line.trim()) { flushParagraph(); continue; }
    if (index + 1 < lines.length && line.includes('|') && isTableSeparator(lines[index + 1])) {
      flushParagraph();
      const rows = [splitTableRow(line)];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) rows.push(splitTableRow(lines[index++]));
      index -= 1;
      blocks.push({ kind: 'table', rows });
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (heading) { flushParagraph(); blocks.push({ kind: 'heading', text: heading[2], level: heading[1].length }); continue; }
    const quote = line.match(/^\s{0,3}>\s?(.*)$/);
    if (quote) { flushParagraph(); blocks.push({ kind: 'quote', text: quote[1] }); continue; }
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) { flushParagraph(); blocks.push({ kind: 'list', text: bullet[1], marker: '•' }); continue; }
    const number = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (number) { flushParagraph(); blocks.push({ kind: 'list', text: number[2], marker: `${number[1]}.` }); continue; }
    paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

export type InlineMarkdownPiece = { kind: 'plain' | 'bold' | 'italic' | 'code' | 'link'; text: string; url?: string };

export function parseInlineMarkdown(text: string): InlineMarkdownPiece[] {
  const tokenPattern = /(\[[^\]]+\]\(https?:\/\/[^\s)]+(?:\([^\s)]*\)[^\s)]*)?\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/gi;
  return text.split(tokenPattern).filter(Boolean).map(piece => {
    const link = piece.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+(?:\([^\s)]*\)[^\s)]*)?)\)$/i);
    if (link) return { kind: 'link', text: link[1], url: link[2] };
    if (piece.startsWith('**') && piece.endsWith('**')) return { kind: 'bold', text: piece.slice(2, -2) };
    if (piece.startsWith('`') && piece.endsWith('`')) return { kind: 'code', text: piece.slice(1, -1) };
    if (piece.startsWith('*') && piece.endsWith('*')) return { kind: 'italic', text: piece.slice(1, -1) };
    return { kind: 'plain', text: piece };
  });
}

export type CodeToken = { text: string; tone: 'plain' | 'keyword' | 'function' | 'string' | 'number' | 'comment' | 'key' | 'literal' };

/** Lightweight syntax coloring for common Python and JSON response snippets. */
export function tokenizeCode(code: string, language?: string): CodeToken[] {
  const normalized = (language ?? '').toLowerCase();
  const mode = normalized === 'json' || normalized === 'jsonc' ? 'json' : /^(py|python)$/.test(normalized) ? 'python' : 'fallback';
  if (mode === 'fallback') return [{ text: code, tone: 'plain' }];
  const tokens: CodeToken[] = [];
  const pattern = mode === 'json'
    ? /(\/\/[^\n]*|"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|[{}\[\],:]|\s+|.)/g
    : /(#[^\n]*|(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b(?:False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|print)\b|\b[A-Za-z_]\w*\b|-?\b\d+(?:\.\d+)?\b|\s+|.)/g;
  const matches = Array.from(code.matchAll(pattern));
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const value = match[0];
    let tone: CodeToken['tone'] = 'plain';
    if (mode === 'json') {
      if (value.startsWith('//')) tone = 'comment';
      else if (value.startsWith('"') && /^\s*:/.test(code.slice(match.index! + value.length))) tone = 'key';
      else if (value.startsWith('"')) tone = 'string';
      else if (/^(true|false|null)$/.test(value)) tone = 'literal';
      else if (/^-?\d/.test(value)) tone = 'number';
    } else if (value.startsWith('#')) tone = 'comment';
    else if (/^['"]/.test(value)) tone = 'string';
    else if (/^(False|None|True)$/.test(value)) tone = 'literal';
    else if (/^(and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|print)$/.test(value)) tone = 'keyword';
    else if (/^[A-Za-z_]\w*$/.test(value)) {
      const previous = matches.slice(0, index).reverse().find(token => token[0].trim());
      const next = matches.slice(index + 1).find(token => token[0].trim());
      if (previous?.[0] === 'def' || next?.[0] === '(') tone = 'function';
    }
    else if (/^-?\d/.test(value)) tone = 'number';
    tokens.push({ text: value, tone });
  }
  return tokens;
}
