# Daimon local live-model proxy

This Node proxy keeps the AcademicCloud API key on the development computer. It binds only to 127.0.0.1, accepts bounded user/assistant conversation history plus at most one image or document on the latest user message, calls the OpenAI-compatible chat completions endpoint, and returns the full assistant response. It never logs prompts, document text, request bodies, or credentials. The client keeps picked files in app-owned storage; on Send, file bytes are sent to this local proxy, which extracts text and forwards that text to AcademicCloud. Neither the proxy nor upstream request stores conversation history.

## Run on Windows PowerShell

Use Node.js 22 or newer. PDF extraction uses Mozilla PDF.js (`pdfjs-dist`) on the proxy only; the parser is not imported into the Expo app. Enter the key at the hidden prompt; it is not part of a command, process argument, or file. The proxy reads it from its runtime environment.

```powershell
$secureAcademicKey = Read-Host -Prompt 'AcademicCloud API key' -AsSecureString
$env:ACADEMICCLOUD_API_KEY = [System.Net.NetworkCredential]::new('', $secureAcademicKey).Password
Remove-Variable secureAcademicKey
try {
  node .\dev\live-model-proxy\server.mjs
} finally {
  Remove-Item Env:ACADEMICCLOUD_API_KEY -ErrorAction SilentlyContinue
}
```

The server prints only the selected model and loopback address. Stop it with Ctrl+C. The default port is 18765; set LIVE_MODEL_PROXY_PORT before launch to choose another port. The default model is qwen3-30b-a3b-instruct-2507. Set LIVE_MODEL_ID to another READY text model from /models when needed. The optional composer effort choices route text requests to `openai-gpt-oss-120b` with `reasoning_effort` set to `low`, `medium`, or `high`; set `REASONING_MODEL_ID` only if using another compatible model. Normal chat continues to use Qwen. An image request cannot use effort mode because this reasoning model does not accept images, so the app asks the user to switch to Default and keeps the draft and image. PDF and text files are extracted to text before reaching the selected text model. The effort setting requests a supported model parameter and does not guarantee a particular reasoning depth.

For an Android device connected with USB, run this in another PowerShell window:

```powershell
adb reverse tcp:18765 tcp:18765
```

The app can call http://127.0.0.1:18765/chat. For web, the same loopback URL works in the development browser. GET /health returns readiness, model ID, and port.

## Chat contract

POST /chat accepts JSON with at least one user message. Only user and assistant roles are accepted; the proxy adds its own general assistant system prompt. It allows up to 24 messages, 6,000 characters per message, and 12,000 characters total. An optional `reasoningEffort` value may be `low`, `medium`, or `high`; omit it to use the default Qwen route.

```json
{
  "messages": [
    { "role": "user", "content": "Explain what a midpoint is in one sentence." }
  ]
}
```

It returns one complete answer; the proxy does not pretend to stream. The response shape for ordinary text stays:

```json
{
  "message": { "role": "assistant", "content": "A midpoint is the point exactly halfway between two endpoints." },
  "model": "qwen3-30b-a3b-instruct-2507",
  "usage": { "promptTokens": 60, "completionTokens": 18, "totalTokens": 78 },
  "finishReason": "stop"
}
```

The proxy retries one chat request after an upstream 5xx, waiting 250 ms and keeping both attempts within the existing 45-second request timeout. It does not retry timeouts or 4xx responses; failures still return the existing retryable error contract. No conversation history is stored by the proxy.

### One-image vision request

Attach one image to the latest user message with an `image` field containing a PNG or JPEG base64 data URI. Keep `content` as the user's text prompt:

```json
{
  "messages": [
    { "role": "user", "content": "What color is the car?", "image": "data:image/png;base64,iVBORw0KGgo..." }
  ]
}
```

The proxy accepts only `data:image/png;base64,...` or `data:image/jpeg;base64,...`, verifies the file signature against the declared MIME type, and limits the decoded image to 3 MiB. An image is allowed only on the latest user message; assistant or earlier messages with images are rejected. The total JSON body limit is 12 MiB to fit an 8 MiB document's base64 encoding plus bounded conversation text and request metadata. The proxy forwards the latest message as OpenAI-compatible text and `image_url` content, then returns the same ordinary assistant response contract. Vision requests use `VISION_MODEL_ID`, defaulting to `gemma-4-31b-it`; set it to another compatible vision model if needed. No tool definitions are sent on the vision route.

### One PDF or text-file request

Attach one PDF, UTF-8 TXT, or Markdown file to the latest user message with a `document` field. The client keeps the file in app-owned storage and sends its base64 bytes only with this request. Example:

```json
{
  "messages": [{
    "role": "user",
    "content": "Summarize the main points.",
    "document": { "name": "notes.pdf", "mimeType": "application/pdf", "data": "JVBERi0x..." }
  }]
}
```

The proxy validates canonical base64, matching extension and MIME type, and the PDF signature. It accepts files up to 8 MiB, PDFs up to 60 pages, and at most 24,000 extracted characters. PDF text includes page markers. When the character cap is reached, a partial-read notice is included in model context and returned as `documentInfo` for the app to show in the chat. Scanned PDFs without selectable text, password-protected or corrupt PDFs, unsupported files, invalid UTF-8, and over-limit files return specific errors. OCR and PDF password prompts are not supported.

The app associates a successfully sent document with its chat and reuses it for follow-up prompts until the user clears context from the chat overflow menu. Recents and interrupted-request retries preserve the metadata and local file reference. The proxy extracts each request independently; it does not cache parsed documents or conversation text. Extracted text is sent to AcademicCloud as model context. PDF.js extracts text only; it does not perform OCR or preserve layout. The system prompt treats document contents as untrusted reference material and says not to follow instructions embedded in them.

The chat request also offers the model two automatic tools. The model can call at most one tool per answer. `render_quiz` accepts 1–5 questions; each has a question of at most 500 characters, exactly four options (at most 300 characters each), a correct option index from 0 to 3, and an optional explanation of at most 600 characters. The proxy validates these values and creates IDs for the returned card schema:

```json
{
  "message": {
    "role": "assistant",
    "content": "Here’s your quiz.",
    "rich": {
      "type": "quiz",
      "questions": [{
        "id": "generated-id",
        "prompt": "Which is a planet?",
        "choices": [
          { "id": "generated-id", "text": "Mars" },
          { "id": "generated-id", "text": "The Moon" },
          { "id": "generated-id", "text": "The Sun" },
          { "id": "generated-id", "text": "A comet" }
        ],
        "correctAnswer": "generated-id-for-the-correct-choice",
        "explanation": "Mars orbits the Sun."
      }]
    }
  },
  "model": "qwen3-30b-a3b-instruct-2507",
  "usage": null,
  "finishReason": "tool_calls"
}
```

`generate_image` accepts a prompt up to 1,000 characters and calls AcademicCloud's Flux image endpoint with one 1024×1024 image. The proxy accepts only canonical base64 output up to 8 MiB decoded, verifies the PNG signature and IHDR dimensions, and returns it inline as `message.rich` with type `generated_image`, MIME type, dimensions, base64 data, and alt text. It rejects a non-PNG image, a declared non-PNG MIME type, or dimensions other than 1024×1024. For image-only answers, `message.content` is an empty string and `message.rich.alt` carries the accessible description; any actual assistant text is preserved in `message.content`. This keeps the current API key on the development computer; the returned image payload itself is sent to the app. Image generation has a 90-second timeout. The provider's image generation is nondeterministic, and the alt text describes the request rather than certifying image contents.

Tool arguments are validated strictly; unsupported fields, malformed JSON, multiple tool calls, and invalid image data return an error instead of a rich message. The proxy does not generate citations or sources.

## Local contract tests

Run `node --test .\dev\live-model-proxy\server.test.mjs` to check PDF/text validation and extraction, bounds and failure cases, rich quiz validation, image base64 validation, invalid tool calls, and the unchanged ordinary-text response shape. These tests do not call AcademicCloud.

## Focused live smoke check

Start the proxy, then run:

```powershell
node .\dev\live-model-proxy\smoke.mjs
```

The smoke check sends one benign general chat request through the local proxy, validates the complete response contract, and prints the model, elapsed time, token usage, and answer. It does not print the API key.
