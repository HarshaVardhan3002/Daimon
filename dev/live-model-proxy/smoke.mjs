const baseUrl = (process.env.LIVE_MODEL_PROXY_URL || 'http://127.0.0.1:18765').replace(/\/+$/, '');
const startedAt = performance.now();
const response = await fetch(`${baseUrl}/chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  signal: AbortSignal.timeout(60_000),
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'In one sentence, explain what a midpoint is.' }],
  }),
});
const elapsedMs = Math.round(performance.now() - startedAt);
const payload = await response.json();
if (!response.ok) {
  const message = payload?.error?.message || `HTTP ${response.status}`;
  throw new Error(`Smoke request failed (${response.status}): ${message}`);
}
if (payload?.message?.role !== 'assistant' || typeof payload.message.content !== 'string' || !payload.message.content.trim()) {
  throw new Error('Smoke response did not contain an assistant answer.');
}
if (typeof payload.model !== 'string' || !payload.model) throw new Error('Smoke response did not include its model ID.');
if (payload.usage !== null && (!payload.usage || !Number.isInteger(payload.usage.promptTokens) || !Number.isInteger(payload.usage.completionTokens) || !Number.isInteger(payload.usage.totalTokens))) {
  throw new Error('Smoke response token usage was invalid.');
}
if (payload.finishReason !== null && typeof payload.finishReason !== 'string') throw new Error('Smoke response finish reason was invalid.');
console.log(JSON.stringify({
  status: response.status,
  elapsed_ms: elapsedMs,
  model_id: payload.model,
  usage: payload.usage,
  finish_reason: payload.finishReason,
  answer: payload.message.content,
}));
