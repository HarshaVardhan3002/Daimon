# Daimon — implementation handoff

**Status:** Daimon is a general-purpose assistant with a live model connection, quizzes, image generation, image understanding, and local PDF/TXT/Markdown text extraction. One document can remain available as context for follow-up questions in its chat. Daimon is an independent app and is not affiliated with another chat product or model provider.

## Product contract

The conversation is the product. User messages appear as compact authored bubbles; Daimon answers use the full reading width without a second enclosing bubble. Home stays quiet, the composer remains docked above the keyboard, and an approximately 80%-width drawer contains New chat, conversation search, Recents, and settings. The active shell supports English and German, dark and light themes, saved chats, persistent drafts, retryable failures, and a clear cancel action while a response is pending. Preserve the live model, quizzes, code and table rendering, image generation, image understanding, and file attachment behavior.

Use the approved local device captures and notes as the visual and interaction reference for named home, composer, sent-message, answer, and drawer states. Keep device evidence outside the public source repository; do not imply iOS acceptance from Android evidence.

## Technical baseline

| Area | Current approach |
|---|---|
| App | Expo SDK 57, React Native 0.86.3, TypeScript, Hermes, Expo Router. Keep the chat shell mounted while the drawer and settings appear. |
| Visual system | Bundled Inter, semantic light/dark tokens, rounded outline icons, readable spacing, accessible labels and touch targets. |
| Conversation | Persist authored prompt/answer pairs and per-chat drafts in AsyncStorage. Preserve older stored turns and chat titles; render legacy activity entries as readable text or a calm earlier-version notice. Never clear storage as a migration shortcut. |
| Responses | Render model text with the native Markdown renderer, including paragraph breaks, headings, lists, emphasis, fenced code, clickable links, and horizontally scrollable tables. No web view or generated code renderer is used. |
| Test transport | Optional local proxy on loopback port 18765. The client sends bounded user/assistant history and request-only image/document data on the latest user message; the proxy owns parsing, system prompting, and model credentials. The key must never enter app source, assets, logs, or APK. |
| Streaming/cancel | The current `/chat` test contract returns a full completion rather than token streaming. Abort the pending HTTP request when Stop is pressed. Keep the sent prompt as a draft until a successful response is saved. |

## Build order and review gates

| Gate | Scope | Pass condition |
|---|---|---|
| **0 — Native shell** | Safe areas, app fonts, theme/locale, drawer, keyboard-safe composer, persistent app state. | Cold launch works; EN/DE and light/dark work; stored chats/drafts hydrate without silent replacement. |
| **1 — Ordinary conversation** | General prompt, user bubble, pending state with Stop, full assistant response, copy, error/retry, New chat, search and Recents. | With the optional local proxy available, an arbitrary prompt and recent conversation context produce a real response that is saved and readable. If disconnected or upstream fails, preserve the draft and show a plain-language retry state. No canned fixture answer appears in the main Send path; no streaming is promised. No visible dead control. |
| **2 — General shell review** | OnePlus visual and interaction walkthrough; legacy stored chat review; accessibility, enlarged text, locale and appearance checks. | Home → compose → send → answer → follow-up → drawer/search → saved chat → new chat works without lost input. Capture matching states at default and 1.3× text; mark untested platforms pending. |
| **3 — Attachments and tools** | Image input and generation, plus one app-owned PDF/TXT/Markdown file per prompt. Proxy parses PDF text; per-chat document context supports follow-up prompts and can be cleared from the chat overflow menu. | Image and document data reach the intended model path. Attachments, retry state, Recent archive/reopen, file limits, scan/password/corrupt errors, and truncated extraction are clear and recoverable. OCR is not supported. |
| **4 — Production service and release hardening** | Replace the local proxy harness with an authenticated production API, then validate security, availability, latency, persistence, and supported devices. | Production credentials are not shipped in the client; service errors and cancellation remain clear; build and platform evidence are independently recorded. |

## Active chat state

- Keep one persisted draft per chat. New chat and chat switching must preserve the text the user typed, including when a request failed or the app was interrupted.
- Persist a pending request separately from the visible turn list. A failed request is not shown as a successful assistant message. On restart, an interrupted request returns as retryable with its draft intact.
- Save the authored user prompt and assistant completion together only after a valid completion arrives. Do not clear a changed draft when an earlier request succeeds.
- Build bounded context from recent saved turns. Do not send legacy sample/demo entries as ordinary chat history.
- Keep sent document bytes in app-owned storage and metadata in the chat/session state. Do not persist base64 or extracted text. The original user turn shows the file card; later prompts in that chat re-read and send its active document context without repeating the card. Clearing context from the chat overflow menu stops its reuse. PDFs are limited to 8 MiB, 60 pages, and 24,000 extracted characters; partial reads are marked in model context and with a banner above the answer, with guidance to attach a shorter/extracted section for omitted content.
- A deliberate fresh launch opens a blank chat and archives the prior active chat to Recents. OS task/process restoration resumes the active chat.
- Keep answer text broad and unboxed. Preserve paragraphs and line breaks. Support copy with localized feedback.
- Search filters the current and saved conversation titles. The current chat can appear in Recents even when it contains only a draft or retryable request.

## Local model test harness

The optional alpha path sends `{ messages: [{ role, content, document? }] }` to `/chat` at `127.0.0.1:18765`; a PDF/text document is request-only, and the proxy returns a complete assistant message with optional `documentInfo`. The proxy uses PDF.js on Node 22+ to parse PDFs; the package is not imported into the Expo bundle. The app does not choose an upstream model and contains no key. On Android, test setup may use `adb reverse tcp:18765 tcp:18765`; the app itself continues to work offline for viewing and editing saved chats. Uploaded files stay in app storage, while extracted text is sent to AcademicCloud as model context and is not retained by the proxy. This is a local connection test, not a production backend, deployment design, availability guarantee, or store-readiness claim. Loopback HTTP is cleartext for this alpha path and must not be treated as a production transport configuration.

## Verification

1. Typecheck and focused proxy/state tests after app changes; run Expo Doctor if build configuration changes.
2. Focused checks for draft/request persistence, PDF extraction limits and errors, follow-up document context, saved-chat switching, hydration of interrupted requests, and bounded message history.
3. On the authorized combined build, use OnePlus captures for the supplied reference states and verify text scale, keyboard placement, theme and locale. No device result is claimed until that walk is actually run.
4. Keep APK builds separate from source review. Debug-signed alpha builds are internal artifacts only, not Play Store releases.

## Immediate next step

Review the PDF/text request, error and context flow in source; run the focused test suite and typecheck. Device QA validates the lifecycle contract: a deliberate fresh launch opens a blank chat with the prior chat in Recents, while OS task restoration resumes the active chat.
