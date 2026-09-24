import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const modelClientUrl = new URL('../src/chat/modelClient.ts', import.meta.url);
const quizDataUrl = new URL('../src/chat/quizCardData.ts', import.meta.url).href;
const modelClientSource = (await readFile(modelClientUrl, 'utf8')).replace("from './quizCardData'", `from '${quizDataUrl}'`);
const compiledModelClient = ts.transpileModule(modelClientSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { ChatClientError, sendChatCompletion } = await import(`data:text/javascript;base64,${Buffer.from(compiledModelClient).toString('base64')}`);

test('sends a document as request-only latest-message data and validates truncation metadata', async () => {
  const previousFetch = globalThis.fetch;
  const pdfBytes = Buffer.from('%PDF-1.4 small fixture');
  let payload;
  globalThis.fetch = async (_url, init) => {
    payload = JSON.parse(init.body);
    return new Response(JSON.stringify({
      message: { role: 'assistant', content: 'The first section says hello.' },
      model: 'test-model', usage: null, finishReason: 'stop',
      documentInfo: { pagesRead: 3, pagesTotal: 4, characters: 24000, truncated: true },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await sendChatCompletion([{ role: 'user', content: 'What does the file say?', document: {
      name: 'notes.pdf', mimeType: 'application/pdf', data: pdfBytes.toString('base64'),
    } }]);
    assert.equal(payload.messages[0].document.name, 'notes.pdf');
    assert.equal(Buffer.from(payload.messages[0].document.data, 'base64').toString(), pdfBytes.toString());
    assert.equal(result.documentInfo.pagesRead, 3);
    assert.equal(result.documentInfo.pagesTotal, 4);
    assert.equal(result.documentInfo.truncated, true);
  } finally { globalThis.fetch = previousFetch; }
});

test('rejects documents outside the latest user message and conflicting attachments before fetch', async () => {
  const doc = { name: 'notes.txt', mimeType: 'text/plain', data: Buffer.from('notes').toString('base64') };
  await assert.rejects(sendChatCompletion([
    { role: 'user', content: 'Earlier', document: doc }, { role: 'assistant', content: 'Answer' },
  ]), /latest user message/);
  await assert.rejects(sendChatCompletion([{ role: 'user', content: 'Read this', image: 'data:image/jpeg;base64,/9j/AA==', document: doc }]), /Only one image or document/);
  await assert.rejects(sendChatCompletion([{ role: 'user', content: 'Read this', document: { ...doc, name: 'notes.pdf' } }]), /does not match/);
});

test('returns structured proxy document errors for localized app recovery', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'DOCUMENT_NO_TEXT', message: 'No selectable text was found.' } }), {
    status: 422, headers: { 'content-type': 'application/json' },
  });
  try {
    await assert.rejects(sendChatCompletion([{ role: 'user', content: 'Summarize', document: {
      name: 'scan.pdf', mimeType: 'application/pdf', data: Buffer.from('%PDF-1.4').toString('base64'),
    } }]), error => error instanceof ChatClientError && error.code === 'DOCUMENT_NO_TEXT');
  } finally { globalThis.fetch = previousFetch; }
});
