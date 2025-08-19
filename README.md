# A2 Schreibtrainer (Next.js + Tailwind v4 + Prisma + OpenRouter)

A local-first web app to practice **Goethe A2 Schreiben**.  
It generates exam-style tasks (Teil 1 / Teil 2), lets you write answers, evaluates them with an LLM, shows **colored score bars** by criterion, and saves everything to history.  
It also ships with a **Dictionary & Chat** tool (plus its own history) for quick lookups, verb tables, translations, synonyms/antonyms, etc.

---

## Features

- **Modern, full-screen UI** (browser-like top bar with tabs + address bar)
- **Tabs / Routes**
  - `/teil/1/write`, `/teil/2/write` — task generator + answer + evaluation
  - `/teil/1/history`, `/teil/2/history` — saved attempts with full details
  - `/dict` — dictionary & chat tools (single mode active at a time)
  - `/dict/history` — persisted dictionary results (expand/collapse), search & filter
- **Task generator** via OpenRouter using your prompt (German-only tasks)
- **Evaluation** via OpenRouter (strict A2 examiner prompt)
  - Scores for **Inhalt**, **Grammatik**, **Wortschatz**, **Form**
  - Overall score, corrections, mistake list, A2/B1 suggestions, glossary
  - Colored **bar indicators** for each criterion (no pie charts)
- **Dictionary & Chat modes**
  - `dict` (translate + senses + usage examples)
  - `verb` (infinitive, English meaning, **full conjugation table**)
  - `example_sentence` (3–5 examples with EN)
  - `translate_en_de`, `translate_de_en`
  - `synonym`, `antonym` (≤5 with examples)
  - `get_infinitive`
  - `chat` (plain chat when no mode selected)
- **History**
  - Task attempts are stored (task + user answer + full evaluation JSON)
  - Dictionary results are stored (full structured JSON) with **expand/collapse**
  - **Clear history** buttons
- **Model picker** (persisted to `localStorage`)
  - Customize the available LLMs in `lib/models.ts`
- **Works offline (mock mode)** if OpenRouter is unreachable or no API key is set

---

## Tech Stack

- **Next.js 14 (App Router)**
- **React 18**
- **Tailwind CSS v4**
- **Prisma** + **SQLite**
- **OpenRouter** (LLM gateway)

---

## Project Structure (high level)

```
app/
  api/
    generate-task/route.ts      # uses composeGeneratePrompt()
    evaluate/route.ts           # uses composeEvaluationPrompt()
    lex/route.ts                # dictionary/chat modes
    lex/history/route.ts        # dictionary history (GET/DELETE)
  page.tsx                      # main UI (tabs, views, components)

lib/
  db.ts                         # Prisma client
  prompts.ts                    # all prompt builders (generate/evaluate + dictionary)
  models.ts                     # list/labels of allowed OpenRouter models

prisma/
  schema.prisma                 # Task, Attempt, LexLog (stringified JSON)

styles/
  globals.css                   # Tailwind v4 entry (if present)

next.config.mjs                 # Next config (ESM)
```

---

## Database Models (Prisma)

> SQLite doesn’t support `Json` on older connectors — we **serialize JSON as strings**.

```prisma
model Task {
  id        String   @id @default(cuid())
  teil      Int
  topic     String
  prompt    String     // the LLM prompt used to generate the task
  taskText  String
  createdAt DateTime @default(now())
  attempts  Attempt[]
}

model Attempt {
  id         String   @id @default(cuid())
  taskId     String
  userAnswer String
  evaluation String   // JSON.stringify(evaluation object)
  scores     String   // JSON.stringify(scores object)
  createdAt  DateTime @default(now())
  task       Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
}

model LexLog {
  id        String   @id @default(cuid())
  mode      String
  text      String
  result    String   // JSON.stringify(dictionary output)
  model     String?
  createdAt DateTime @default(now())
}
```

---

## Prerequisites

- **Node.js 20+**
- **pnpm**
- **SQLite** (bundled with Prisma; no extra install needed)
- Optional: **OpenRouter API key** (free-tier available)

---

## Setup

1) **Install deps**
```bash
pnpm install
```

2) **Environment variables**

Create `.env` at project root:

```env
# Database
DATABASE_URL="file:./dev.db"

# OpenRouter
OPENROUTER_API_KEY="sk-or-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
# Optional default model if the UI’s picker hasn’t run yet:
OPENROUTER_MODEL="openai/gpt-4o-mini"
```

3) **Database**
```bash
pnpm prisma generate
pnpm prisma migrate dev -n init
# (if you just added LexLog later)
pnpm prisma migrate dev -n add_lexlog
```

4) **Run**
```bash
pnpm dev
# open http://localhost:3000
```

---

## Usage

### Browser-like UI

- **Tabs**: click **+** to open a new tab. Tabs can point to any route.  
- **Address bar**: type a path and hit **Enter**:
  - `/teil/1/write`, `/teil/2/write`
  - `/teil/1/history`, `/teil/2/history`
  - `/dict`, `/dict/history`
- **Reload** button refreshes the active tab’s data.
- **Model select** changes the LLM for API calls (persisted to `localStorage`).

### Writing practice (Teil 1 / Teil 2)

1. Go to `/teil/1/write` or `/teil/2/write`.  
2. (Optional) Enter a **Topic**. If empty, **topic is randomized**.  
3. Click **Generate** → a **German** task appears.  
4. Write your answer.  
5. Click **Evaluate** → colored bars + detailed feedback appear.  
6. Everything is saved to `/teil/X/history`.

**Shortcuts**
- **Ctrl/Cmd + G** — Generate
- **Ctrl/Cmd + Enter** — Evaluate (write tab) / **Send** (dict tab)

### Dictionary & Chat

Go to `/dict`. Pick **one** mode:

- **Chat**: simple assistant (no memory)
- **Dict ask**: senses, parts of speech, examples
- **Verb**: full conjugation table, Partizip I/II, Imperativ
- **Examples**: 3–5 sample sentences (DE + EN)
- **EN→DE / DE→EN**: translation with alternatives
- **Synonym / Antonym**: ≤5, with example usage
- **Get infinitive**: normalize any form to infinitive + English meaning

All responses are saved to **`/dict/history`**; each row can be **expanded** to show the full structured result (e.g., the whole verb table). Use the **mode filter**, **search**, **Reload**, and **Clear** controls.

---

## Configuration & Customization

### Prompts
All LLM prompts live in `lib/prompts.ts`:

- `composeGeneratePrompt(teil, topic?)`
- `composeEvaluationPrompt(taskText, userAnswer)`
- `composeLexMessages(mode, text)` (dictionary/chat)

Safe to tweak wording/criteria here.

### Models
Add/remove models in `lib/models.ts`:

```ts
export const MODELS = [
  { id: "openai/gpt-4o-mini",  label: "OpenAI GPT-4o mini" },
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { id: "google/gemini-flash-1.5", label: "Gemini 1.5 Flash" },
  { id: "openai/gpt-5-chat", label: "OpenAI GPT-5 Chat" },
]
```
UI remembers your pick in `localStorage` (`model` key).

### API routes

- `POST /api/generate-task`
  ```json
  { "teil": 1, "topic": "Urlaub", "model": "openai/gpt-4o-mini" }
  ```
  → Creates a `Task` and returns it (mocked if no API).

- `POST /api/evaluate`
  ```json
  { "taskId": "<task.id>", "userAnswer": "…", "model": "openai/gpt-4o-mini" }
  ```
  → Creates an `Attempt` with evaluation & scores (JSON serialized).

- `POST /api/lex`
  ```json
  { "mode": "verb", "text": "haben", "model": "openai/gpt-4o-mini" }
  ```
  → Returns structured JSON; also saves a `LexLog`.

- `GET /api/lex/history?mode=verb&q=gehen&limit=50`
  - Returns the most recent dictionary results (plus parsed `resultObj`).
- `DELETE /api/lex/history` (optional `?mode=`)

---

## Implementation Notes

- **JSON in SQLite**: Prisma with SQLite often can’t use `Json` type. We store **stringified** JSON in `Attempt.evaluation`, `Attempt.scores`, and `LexLog.result`. Always `JSON.parse` on read and `JSON.stringify` on write.
- **Offline mock**: If `OPENROUTER_API_KEY` is missing or the network times out, the API returns a **mock** response so the UI stays usable.
- **Tailwind v4**: ensure your Tailwind setup is v4-compatible (no `@tailwind` plugins required). Classes are used directly in components.
- **Next config**: Use `next.config.mjs` or `next.config.js` (not `next.config.ts`).

---

## Troubleshooting

- **“No HTTP methods exported”**  
  Ensure each route file exports a named handler: `export async function POST/GET (…) {}`.

- **`Property 'lexLog' does not exist on PrismaClient`**  
  You added the model but didn’t regenerate.  
  Run: `pnpm prisma generate && pnpm prisma migrate dev` and **restart** `pnpm dev`.  
  In VS Code: **TypeScript: Restart TS server**.

- **`TypeError: fetch failed` (ETIMEDOUT)**  
  OpenRouter unreachable → app falls back to **mock**; set `OPENROUTER_API_KEY`.

- **Hydration warning “Text content did not match” for model select**  
  Initialize the model from `localStorage` inside a client component and update after mount. We already do this pattern in the address bar row.

- **History shows under `/dict`**  
  Use **exclusive branches** for views; don’t render history via a ternary fallback. The code uses one-branch-per-view now.

---

## Keyboard Shortcuts

- **Ctrl/Cmd + G** — Generate task (write tab)
- **Ctrl/Cmd + Enter** — Evaluate (write) / Send (dict)
- Hover the shortcut “streak” indicator (if enabled) to view all.

---

## Scripts

```bash
pnpm dev        # run in development
pnpm build      # production build
pnpm start      # start production server
pnpm prisma generate
pnpm prisma migrate dev -n <name>
pnpm prisma studio
```

---

## Privacy & Local Use

This app is intended for **localhost** use. When you enable OpenRouter, prompts and your text are sent to the selected model via OpenRouter. Disable or remove the API key to keep everything local and use **mock** responses.

---

## Roadmap (ideas)

- Per-user auth (multi-user history)
- Export attempts to PDF/Markdown
- Audio TTS/ASR for dict examples
- Custom rubrics / more criteria

---

If you want this README bundled in the repo with screenshots and badges, drop in your images and link them in the top section. Happy studying — **Viel Erfolg!**
