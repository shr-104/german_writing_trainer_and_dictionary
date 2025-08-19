"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { MODELS, DEFAULT_MODEL } from "@/lib/models"
import ModelSelect from "@/components/model-select"
import type { LexMode } from "@/lib/prompts"

/* ---------------------- Types ---------------------- */

type Teil = 1 | 2
type View = "write" | "history" | "dict" | "dict_history"
// type TabState = { id: string; title: string; teil: Teil; view: View }


export type Task = {
  id: string
  teil: Teil
  topic: string
  taskText: string
  _note?: string // from mock/offline
}
export type Attempt = {
  id: string
  taskId: string
  createdAt: string
  userAnswer: string
  scores: Record<string, number>
  evaluation: any
}
type AttemptWithTask = Attempt & { task: { id: string; teil: Teil; topic: string; taskText: string } }

type WriteState = {
  topic: string
  task: Task | null
  answer: string
  attempt: Attempt | null
  loadingGen: boolean
  loadingEval: boolean
}

type HistoryState = {
  items: AttemptWithTask[]
  loading: boolean
  q: string
}

/* ---------------------- Page ---------------------- */

export default function Page() {
  // Tabs
  const [tabs, setTabs] = useState<TabState[]>(() => [
    newTab("Teil 1 • Write", 1, "write"),
  ])
  const [activeId, setActiveId] = useState<string>(tabs[0].id)

  // Per-tab states
  const [writeById, setWriteById] = useState<Record<string, WriteState>>(() => ({
    [tabs[0].id]: emptyWriteState(),
  }))
  const [histById, setHistById] = useState<Record<string, HistoryState>>({})
  const addressRef = useRef<HTMLInputElement>(null)

  // Address bar (controlled) + API mocked status dot
  const [addressValue, setAddressValue] = useState<string>(() => addressFor(tabs[0]) ?? "/teil/1/write")
  const [apiMocked, setApiMocked] = useState<null | boolean>(null)

  type LexState = { mode: LexMode; text: string; loading: boolean; result: any | null }
  function emptyLexState(): LexState { return { mode: "chat", text: "", loading: false, result: null } }

  const [lexById, setLexById] = useState<Record<string, LexState>>({})
  function patchLex(s: Record<string, LexState>, id: string, patch: Partial<LexState>) {
    return { ...s, [id]: { ...(s[id] ?? emptyLexState()), ...patch } }
  }

async function sendLex() {
  if (tab.view !== "dict") return
  const id = tab.id
  const cur = lexById[id] ?? emptyLexState()
  const text = typeof cur.text === "string" ? cur.text : ""  // ✅ guard
  if (!text.trim()) return
  setLexById(s => patchLex(s, id, { loading: true }))
  try {
    const res = await fetch("/api/lex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: cur.mode, text, model }),
    })
    const { data } = await res.json()
    setLexById(s => patchLex(s, id, { result: data, loading: false }))
  } catch (e) {
    console.error(e)
    setLexById(s => patchLex(s, id, { loading: false }))
  }
}

type LexHistItem = {
  id: string
  mode: string
  text: string
  resultObj: any
  model?: string | null
  createdAt: string
}
type LexHistState = { q: string; mode: string; loading: boolean; items: LexHistItem[] }

function emptyLexHist(): LexHistState { return { q: "", mode: "all", loading: false, items: [] } }

const [lexHistById, setLexHistById] = useState<Record<string, LexHistState>>({})

function patchLexHist(s: Record<string, LexHistState>, id: string, patch: Partial<LexHistState>) {
  return { ...s, [id]: { ...(s[id] ?? emptyLexHist()), ...patch } }
}

async function reloadLexHistory(tabId: string) {
  const st = lexHistById[tabId] ?? emptyLexHist()
  setLexHistById(s => patchLexHist(s, tabId, { loading: true }))

  const params = new URLSearchParams()
  const q = typeof st.q === "string" ? st.q.trim() : ""
  if (q) params.set("q", q)
  if (st.mode && st.mode !== "all") params.set("mode", st.mode)

  const res = await fetch(`/api/lex/history?${params.toString()}`)
  const json = await res.json().catch(() => ({ items: [] }))
  setLexHistById(s => patchLexHist(s, tabId, { items: json.items ?? [], loading: false }))
}

async function clearLexHistory(tabId: string) {
  const st = lexHistById[tabId] ?? emptyLexHist()
  const qs = st.mode && st.mode !== "all" ? `?mode=${encodeURIComponent(st.mode)}` : ""
  await fetch(`/api/lex/history${qs}`, { method: "DELETE" })
  reloadLexHistory(tabId)
}

  // Active tab + derived
  const tab = tabs.find(t => t.id === activeId)! // always exists
  const wState = writeById[tab.id] ?? emptyWriteState()
  const hState = histById[tab.id] ?? emptyHistoryState()

  // Persist selection in localStorage so it sticks between reloads
const [model, setModel] = useState(DEFAULT_MODEL)

// After mount, read saved value
useEffect(() => {
  try {
    const saved = localStorage.getItem("model")
    if (saved) setModel(saved)
  } catch {}
}, [])

// Keep saving updates
useEffect(() => {
  try {
    localStorage.setItem("model", model)
  } catch {}
}, [model])


  // Keep address bar in sync with active tab
  useEffect(() => {
    setAddressValue(addressFor(tab) ?? "/teil/1/write")
  }, [tab])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      const isWrite = tab.view === "write"
      if (meta && e.key.toLowerCase() === "l") {
        e.preventDefault()
        addressRef.current?.select()
      }
      if (meta && e.key.toLowerCase() === "n") {
        e.preventDefault()
        handleNewTab()
      }
      if (meta && e.key.toLowerCase() === "w") {
        e.preventDefault()
        handleCloseTab(tab.id)
      }
      if (meta && e.key.toLowerCase() === "r") {
        e.preventDefault()
        handleReload()
      }
      if (meta && e.key.toLowerCase() === "g" && isWrite) {
        e.preventDefault()
        generateTask()
      }
      if (meta && e.key === "Enter" && isWrite) {
        e.preventDefault()
        evaluate()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, wState])

  /* ---------------------- Tab handlers ---------------------- */

  function handleNewTab() {
    const t = newTab("Teil 1 • Write", 1, "write")
    setTabs((prev) => [...prev, t])
    setActiveId(t.id)
    setWriteById((s) => ({ ...s, [t.id]: emptyWriteState() }))
  }

  function handleCloseTab(id: string) {
    setTabs((prev) => {
      if (prev.length === 1) return prev // keep at least one
      const idx = prev.findIndex((p) => p.id === id)
      const next = prev.filter((p) => p.id !== id)
      if (activeId === id) {
        const pick = next[Math.max(0, idx - 1)]
        setActiveId(pick.id)
      }
      return next
    })
  }

  function handleActivate(id: string) {
    setActiveId(id)
  }

  function handleReload() {
    if (tab.view === "history") {
      reloadHistory(tab)
    }
    // For write view, we just leave data as-is (no forced regenerate).
  }

  function onAddressSubmit(e: React.FormEvent) {
    e.preventDefault()
    const v = typeof addressValue === "string" ? addressValue : ""
    const parsed = parseAddress(v)
    if (!parsed) return
    const nextTeil: Teil = parsed.teil ?? tab.teil ?? 1
    const nextView: View = parsed.view
    setTabs(prev =>
      prev.map(p => p.id === tab.id
        ? { ...p, teil: nextTeil, view: nextView, title: nextView === "dict" ? "Dictionary • Chat" : `Teil ${nextTeil} • ${cap(nextView)}` }
        : p
      )
    )
    if (nextView === "write") {
      setWriteById(s => (s[tab.id] ? s : { ...s, [tab.id]: emptyWriteState() }))
    } else if (nextView === "history") {
      setHistById(s => (s[tab.id] ? s : { ...s, [tab.id]: emptyHistoryState() }))
      setTimeout(() => reloadHistory({ ...tab, teil: nextTeil, view: nextView }), 0)
    } else if (nextView === "dict") {
      setLexById(s => (s[tab.id] ? s : { ...s, [tab.id]: emptyLexState() }))
    } else if (nextView === "dict_history") {
      setLexHistById(s => (s[tab.id] ? s : { ...s, [tab.id]: emptyLexHist() }))
      setTimeout(() => reloadLexHistory(tab.id), 0)
    }
  }

  /* ---------------------- API actions (per active tab) ---------------------- */

  async function generateTask() {
    if (tab.view !== "write") return
    const id = tab.id
    // If no topic, auto-randomize BEFORE sending to API and reflect in UI
    const topic = (wState.topic || "").trim() || randomTopic()
    setWriteById((s) => patchWrite(s, id, { topic, loadingGen: true }))
    try {
      const res = await fetch("/api/generate-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teil: tab.teil, topic, model }),
      })
      const t = await res.json()
      setWriteById((s) =>
        patchWrite(s, id, { task: t, answer: "", attempt: null, loadingGen: false }),
      )
      setApiMocked(Boolean(t?._note))
    } catch (e) {
      console.error(e)
      setWriteById((s) => patchWrite(s, id, { loadingGen: false }))
    }
  }

  async function evaluate() {
    if (tab.view !== "write" || !wState.task) return
    const id = tab.id
    setWriteById((s) => patchWrite(s, id, { loadingEval: true }))
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: wState.task.id, userAnswer: wState.answer, model }),
      })
      const a = await res.json()
      setWriteById((s) => patchWrite(s, id, { attempt: a, loadingEval: false }))
      if (a?._note) setApiMocked(true)
    } catch (e) {
      console.error(e)
      setWriteById((s) => patchWrite(s, id, { loadingEval: false }))
    }
  }

  async function reloadHistory(t: TabState) {
    const id = t.id
    setHistById((s) => patchHistory(s, id, { loading: true }))
    try {
      const r = await fetch(`/api/history?teil=${t.teil}`, { cache: "no-store" })
      const d = await r.json()
      setHistById((s) => patchHistory(s, id, { items: d, loading: false }))
    } catch (e) {
      console.error(e)
      setHistById((s) => patchHistory(s, id, { items: [], loading: false }))
    }
  }

  /* ---------------------- Render ---------------------- */

  return (
    <div className="min-h-dvh bg-gray-50">
      {/* Header (full-width) */}
      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
        {/* Tab strip */}
        <div className="flex items-center gap-1 overflow-x-auto px-3 py-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => handleActivate(t.id)}
              className={`group inline-flex items-center gap-2 rounded-lg px-3 py-1 text-sm ${
                t.id === activeId ? "bg-gray-200" : "hover:bg-gray-100"
              }`}
              title={addressFor(t)}
            >
              <span className="truncate max-w-[28ch]">{t.title}</span>
              <span
                onClick={(e) => { e.stopPropagation(); handleCloseTab(t.id) }}
                className="rounded px-1 text-gray-500 hover:bg-gray-300"
                aria-label="Close tab"
              >
                ×
              </span>
            </button>
          ))}
          <button
            onClick={handleNewTab}
            className="ml-1 rounded-lg border px-2 py-1 text-sm hover:bg-gray-50"
            title="New tab (Ctrl/Cmd+N)"
          >
            +
          </button>
        </div>

        {/* Address bar row */}
        <div className="flex items-center gap-2 border-t px-3 py-2">
          <form onSubmit={onAddressSubmit} className="flex-1">
            <input
              ref={addressRef}
              value={addressValue}
              onChange={(e) => setAddressValue(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="/teil/1/write · /teil/2/history · /dict · /dict/history"
            />
          </form>

          {/* NEW: model select */}
          {/* <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="rounded-xl border px-2 py-2 text-sm"
            title="LLM model"
          >
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select> */}

          <ModelSelect value={model} onChange={setModel} />

          <button
            onClick={handleReload}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
            title="Reload (Ctrl/Cmd+R)"
          >
            ⟳
          </button>

          <ShortcutHelp />

          {/* <span
            className={`h-2 w-2 rounded-full ${apiMocked === null ? "bg-gray-300" : apiMocked ? "bg-gray-400" : "bg-emerald-500"}`}
            title={apiMocked === null ? "API status unknown" : apiMocked ? "Mocked (offline)" : "API online"}
          /> */}
        </div>
      </header>

      {/* Content (full-width, scales with window) */}
      <main className="grid gap-6 p-4 md:p-6">
        {tab.view === "dict" && (
          <section className="rounded-2xl border bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">Dictionary & Chat</h2>

            <ModePicker
              value={(lexById[tab.id] ?? emptyLexState()).mode}
              onChange={(m) => setLexById((s) => patchLex(s, tab.id, { mode: m, result: null }))}
            />

            <div className="mt-3 grid gap-2">
              <textarea
                value={(lexById[tab.id] ?? emptyLexState()).text}
                onChange={(e) => setLexById((s) => patchLex(s, tab.id, { text: e.target.value }))}
                onKeyDown={(e) => {
                  // Meta = Cmd on macOS; Ctrl on Windows/Linux
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();        // stop newline insertion
                    sendLex();                 // calls your API
                  }
                }}
                placeholder="Type a word or sentence…  (Ctrl/Cmd+Enter to send)"
                className="h-[36vh] rounded-xl border p-3"
              />
              <div className="flex justify-end">
                <button
                  onClick={sendLex}
                  disabled={(lexById[tab.id] ?? emptyLexState()).loading}
                  className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
                  title="Send (Ctrl/Cmd+Enter)"
                >
                  {(lexById[tab.id] ?? emptyLexState()).loading ? "Working…" : "Send"}
                </button>
              </div>
            </div>

            <div className="mt-4">
              <LexOutput state={lexById[tab.id] ?? emptyLexState()} />
            </div>
          </section>
        )}
        {tab.view === "write" && (
          <section className="rounded-2xl border bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">Teil {tab.teil} • Write</h2>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Task generator (left) */}
              <div className="grid gap-3">
                <div className="flex gap-2">
                  <input
                    value={wState.topic}
                    onChange={(e) => setWriteById((s) => patchWrite(s, tab.id, { topic: e.target.value }))}
                    placeholder="Topic (optional) — will randomize if empty"
                    className="flex-1 rounded-xl border px-3 py-2"
                  />
                  <button
                    onClick={generateTask}
                    disabled={wState.loadingGen}
                    className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
                    title="Generate (Ctrl/Cmd+G)"
                  >
                    {wState.loadingGen ? "Generating…" : "Generate"}
                  </button>
                </div>

                <div className="min-h-[40vh] rounded-xl bg-gray-50 p-3 overflow-auto">
                  <div className="text-sm text-gray-500">Task (Teil {tab.teil})</div>
                  {wState.task ? (
                    <p className="whitespace-pre-wrap">{wState.task.taskText}</p>
                  ) : (
                    <p className="text-sm text-gray-500">Click “Generate” to create a task.</p>
                  )}
                </div>
              </div>

              {/* Answer (right) */}
              <div className="grid gap-3">
                <textarea
                  value={wState.answer}
                  onChange={(e) => setWriteById((s) => patchWrite(s, tab.id, { answer: e.target.value }))}
                  placeholder="Write your answer here…"
                  className="h-[40vh] rounded-xl border p-3"
                />
              </div>
            </div>

            {/* sticky eval footer */}
            <div className="sticky bottom-2 mt-4 flex justify-end">
              <button
                onClick={evaluate}
                disabled={wState.loadingEval || !wState.task}
                className="rounded-xl bg-brand-600 px-4 py-2 text-white disabled:opacity-60"
                title="Evaluate (Ctrl/Cmd+Enter)"
              >
                {wState.loadingEval ? "Evaluating…" : "Evaluate"}
              </button>
            </div>

            {/* Evaluation */}
            {wState.attempt && (
              <div className="mt-4 grid gap-3">
                <div className="grid gap-3 rounded-2xl border p-4">
                  <h3 className="mb-1 font-semibold">Score by criteria</h3>
                  <ScoreBars scores={wState.attempt.scores || {}} />
                </div>
                {wState.attempt.evaluation && <EvaluationDetails evalObj={wState.attempt.evaluation} />}
              </div>
            )}
          </section>
        )}
        {tab.view === "history" && (
          <section className="rounded-2xl border bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Teil {tab.teil} • History</h2>
              <ClearHistory teil={tab.teil} onCleared={() => reloadHistory(tab)} />
            </div>
            <HistoryWithSearch
              teil={tab.teil}
              state={hState}
              setState={(ns) => setHistById((s) => ({ ...s, [tab.id]: ns }))}
              onInitialLoad={() => reloadHistory(tab)}
            />
          </section>
        )}
        {tab.view === "dict_history" && (
          <DictHistoryPane
            tab={tab}
            st={lexHistById[tab.id] ?? emptyLexHist()}
            setSt={(patch) => setLexHistById(s => patchLexHist(s, tab.id, patch))}
            onReload={() => reloadLexHistory(tab.id)}
            onClear={() => clearLexHistory(tab.id)}
          />
        )}
      </main>
    </div>
  )
}

/* ---------------------- Header helpers ---------------------- */

function ShortcutHelp() {
  return (
    <div className="group relative">
      <span
        className="inline-flex select-none items-center justify-center rounded-lg border px-2 py-1 text-sm hover:bg-gray-50"
        title="Keyboard shortcuts"
      >
        ?
      </span>
      <div className="pointer-events-none absolute right-0 z-50 mt-2 hidden w-[260px] rounded-xl border bg-white p-3 text-sm text-gray-700 shadow group-hover:block">
        <div className="mb-1 font-medium">Shortcuts</div>
        <ul className="space-y-1">
          <li><b>Ctrl/Cmd + L</b> – Focus address bar</li>
          <li><b>Ctrl/Cmd + N</b> – New tab</li>
          <li><b>Ctrl/Cmd + W</b> – Close tab</li>
          <li><b>Ctrl/Cmd + R</b> – Reload tab</li>
          <li><b>Ctrl/Cmd + G</b> – Generate (Write)</li>
          <li><b>Ctrl/Cmd + Enter</b> – Evaluate (Write)</li>
        </ul>
      </div>
    </div>
  )
}

/* ---------------------- Components ---------------------- */

type TabState = { id: string; title: string; teil: Teil; view: View }
function newTab(title: string, teil: Teil, view: View): TabState {
  return { id: cryptoRandomId(), title, teil, view }
}

function addressFor(t: TabState) {
  switch (t.view) {
    case "dict": return "/dict"
    case "dict_history": return "/dict/history"
    default: return `/teil/${t.teil}/${t.view}`
  }
}

function parseAddress(v: unknown): { teil?: Teil; view: View } | null {
  const s = typeof v === "string" ? v : ""
  const path = s.trim().replace(/^https?:\/\/[^/]+/, "")
  if (/^\/?dict\/?$/i.test(path)) return { view: "dict" }
  if (/^\/?dict\/history\/?$/i.test(path)) return { view: "dict_history" }
  const m = path.match(/^\/?teil\/(1|2)\/(write|history)\/?$/i)
  if (!m) return null
  return { teil: Number(m[1]) as Teil, view: m[2].toLowerCase() as View }
}


/** Colored bars 0–100 per criterion */
function ScoreBars({ scores }: { scores: Record<string, number> }) {
  const items: { key: string; color: string }[] = [
    { key: "Inhalt",     color: "bg-[#22c55e]" },
    { key: "Grammatik",  color: "bg-[#3b82f6]" },
    { key: "Wortschatz", color: "bg-[#f59e0b]" },
    { key: "Form",       color: "bg-[#ef4444]" },
  ]
  const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0))
  return (
    <div className="space-y-3">
      {items.map(({ key, color }) => {
        const value = clamp(Number(scores?.[key]))
        return (
          <div key={key} className="grid gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{key}</span>
              <span className="tabular-nums text-gray-600">{value}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
              <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${value}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FullLexOutput({ mode, data }: { mode: LexMode; data: any }) {
  // LexOutput expects a "state" object; we just adapt the stored data
  const state = { mode, text: "", loading: false, result: data }
  return <LexOutput state={state} />
}

function DictHistoryPane({
  tab,
  st,
  setSt,
  onReload,
  onClear,
}: {
  tab: { id: string }
  st: { q: string; mode: string; loading: boolean; items: any[] }
  setSt: (patch: Partial<{ q: string; mode: string; loading: boolean; items: any[] }>) => void
  onReload: () => void
  onClear: () => void
}) {
  return (
    <section className="rounded-2xl border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Dictionary History</h2>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={st.mode}
            onChange={(e) => setSt({ mode: e.target.value })}
            className="rounded-xl border px-2 py-1 text-sm"
            title="Filter by mode"
          >
            <option value="all">All</option>
            <option value="dict">Dict ask</option>
            <option value="verb">Verb</option>
            <option value="example_sentence">Examples</option>
            <option value="translate_en_de">EN→DE</option>
            <option value="translate_de_en">DE→EN</option>
            <option value="synonym">Synonym</option>
            <option value="antonym">Antonym</option>
            <option value="get_infinitive">Get infinitive</option>
          </select>

          <input
            value={st.q}
            onChange={(e) => setSt({ q: e.target.value ?? "" })}
            placeholder="Search…"
            className="w-56 rounded-xl border px-3 py-1 text-sm"
          />

          <button
            onClick={onReload}
            className="rounded-xl border px-3 py-1 text-sm"
            disabled={st.loading}
          >
            {st.loading ? "Loading…" : "Reload"}
          </button>

          <button
            onClick={onClear}
            className="rounded-xl border px-3 py-1 text-sm text-red-600"
          >
            Clear
          </button>
        </div>
      </div>

      <ul className="divide-y rounded-xl border">
        {st.items.map((it) => (
          <li key={it.id} className="grid gap-2 p-3 md:grid-cols-[220px_1fr]">
            <div className="text-xs text-gray-600">
              <div className="font-medium">{new Date(it.createdAt).toLocaleString()}</div>
              <div className="mt-1 inline-flex items-center gap-2">
                <span className="rounded-full border px-2 py-[2px] text-[11px]">{it.mode}</span>
                {it.model ? <span className="rounded-full border px-2 py-[2px] text-[11px]">{it.model}</span> : null}
              </div>
              <div className="mt-2 break-words">
                <span className="font-medium">Input: </span>
                <span>{it.text}</span>
              </div>
            </div>

            <div className="text-sm">
              <FullLexOutput mode={it.mode as any} data={it.resultObj} />
            </div>
          </li>
        ))}
        {!st.items.length && !st.loading && (
          <li className="p-6 text-center text-sm text-gray-500">No entries.</li>
        )}
      </ul>
    </section>
  )
}

function DictResultPreview({ mode, result }: { mode: string; result: any }) {
  if (!result) return null
  if (mode === "dict") {
    const senses = result?.senses ?? []
    return (
      <ul className="list-disc pl-5">
        {senses.slice(0, 3).map((s: any, i: number) => (
          <li key={i}><b>{s.meaningEn}</b>{s.pos ? ` (${s.pos})` : ""}</li>
        ))}
      </ul>
    )
  }
  if (mode === "verb") {
    return <div><b>{result?.infinitive}</b>{result?.meaningEn ? ` — ${result.meaningEn}` : ""}</div>
  }
  if (mode === "translate_en_de" || mode === "translate_de_en") {
    return <div className="text-base font-semibold">{result?.translation}</div>
  }
  if (mode === "synonym" || mode === "antonym") {
    const items = result?.items ?? []
    return <div>{items.slice(0, 3).map((x: any) => x.word).filter(Boolean).join(", ")}</div>
  }
  if (mode === "get_infinitive") {
    return <div><b>{result?.infinitive}</b>{result?.meaningEn ? ` — ${result.meaningEn}` : ""}</div>
  }
  if (mode === "example_sentence") {
    const s = result?.sentences?.[0]
    return s ? <div><span className="font-medium">{s.de}</span><span className="text-gray-600"> — {s.en}</span></div> : null
  }
  // fallback
  return <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(result, null, 2)}</pre>
}


function EvaluationDetails({ evalObj }: { evalObj: any }) {
  const {
    overall,
    corrected,
    mistakes,
    suggestionsA2,
    suggestionsB1,
    glossary,
    feedback,
  } = evalObj || {}

  return (
    <div className="grid gap-3 rounded-2xl border p-4">
      {Number.isFinite(overall) && (
        <div className="grid gap-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Overall</span>
            <span className="tabular-nums">{Math.round(overall)}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full bg-[#0ea5e9] transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, overall))}%` }} />
          </div>
        </div>
      )}

      {corrected && (
        <details className="rounded-xl bg-gray-50 p-3" open>
          <summary className="cursor-pointer text-sm font-medium">Corrected version</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm">{corrected}</p>
        </details>
      )}

      {Array.isArray(mistakes) && mistakes.length > 0 && (
        <details className="rounded-xl bg-gray-50 p-3">
          <summary className="cursor-pointer text-sm font-medium">Mistakes</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {mistakes.map((m: any, i: number) => (
              <li key={i}>
                {m.text ? <span className="font-medium">{m.text}</span> : null}
                {m.explain ? <> — {m.explain}</> : null}
                {m.fix ? <> → <i>{m.fix}</i></> : null}
              </li>
            ))}
          </ul>
        </details>
      )}

      {Array.isArray(suggestionsA2) && suggestionsA2.length > 0 && (
        <details className="rounded-xl bg-gray-50 p-3">
          <summary className="cursor-pointer text-sm font-medium">Suggestions (A2)</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {suggestionsA2.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
        </details>
      )}

      {Array.isArray(suggestionsB1) && suggestionsB1.length > 0 && (
        <details className="rounded-xl bg-gray-50 p-3">
          <summary className="cursor-pointer text-sm font-medium">Suggestions (B1)</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {suggestionsB1.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
        </details>
      )}

      {Array.isArray(glossary) && glossary.length > 0 && (
        <details className="rounded-xl bg-gray-50 p-3">
          <summary className="cursor-pointer text-sm font-medium">Glossary</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {glossary.map((g: any, i: number) => (
              <li key={i}><b>{g.de}</b> — {g.en}</li>
            ))}
          </ul>
        </details>
      )}

      {feedback && (
        <details className="rounded-xl bg-gray-50 p-3" open>
          <summary className="cursor-pointer text-sm font-medium">Feedback</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm">{feedback}</p>
        </details>
      )}
    </div>
  )
}

function ClearHistory({ teil, onCleared }: { teil: Teil; onCleared: () => void }) {
  const [busy, setBusy] = useState(false)
  async function onClear() {
    if (busy) return
    if (!confirm(`Delete all attempts for Teil ${teil}? This cannot be undone.`)) return
    setBusy(true)
    try {
      await fetch(`/api/history?teil=${teil}`, { method: "DELETE" })
      onCleared()
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      onClick={onClear}
      disabled={busy}
      className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-red-700 hover:bg-red-100 disabled:opacity-60"
    >
      {busy ? "Clearing…" : "Clear history"}
    </button>
  )
}

function HistoryWithSearch({
  teil,
  state,
  setState,
  onInitialLoad,
}: {
  teil: Teil
  state: HistoryState
  setState: (next: HistoryState) => void
  onInitialLoad: () => void
}) {
  useEffect(() => {
    if (!state.items.length) onInitialLoad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teil])

  const safeState = state ?? { q: "", items: [] as any[] }

  const filtered = useMemo(() => {
    const needle = (typeof safeState.q === "string" ? safeState.q : "")
      .trim()
      .toLowerCase()

    const items = Array.isArray(safeState.items) ? safeState.items : []

    if (!needle) return items

    return items.filter((it) => {
      // Build a searchable haystack safely
      const hay = (
        (it.task?.taskText ?? "") +
        " " +
        (it.userAnswer ?? "") +
        " " +
        (typeof it.evaluation === "string"
          ? it.evaluation
          : JSON.stringify(it.evaluation ?? ""))
      ).toLowerCase()
      return hay.includes(needle)
    })
  }, [safeState.q, safeState.items])

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={state.q}
          onChange={(e) => setState({ ...state, q: e.target.value })}
          placeholder="Search topic, task, answer, feedback…"
          className="min-w-[220px] flex-1 rounded-xl border px-3 py-2"
        />
      </div>

      {state.loading && <div className="text-sm text-gray-500">Loading…</div>}
      {!state.loading && !filtered.length && <div className="text-sm text-gray-500">No attempts found.</div>}

      <ul className="space-y-2">
        {filtered.map((it) => (
          <li key={it.id} className="rounded-xl border bg-white p-3">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{new Date(it.createdAt).toLocaleString()}</span>
              <span className="italic">
                Teil {it.task.teil} · {it.task.topic}
              </span>
            </div>

            <div className="mt-2">
              <ScoreBars scores={it.scores || {}} />
            </div>

            {it.evaluation && <div className="mt-3"><EvaluationDetails evalObj={it.evaluation} /></div>}

            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium">Show task & answer</summary>
              <div className="mt-2 grid gap-2 text-sm">
                <div className="rounded-xl bg-gray-50 p-2">
                  <div className="text-gray-500">Task</div>
                  <div className="whitespace-pre-wrap">{it.task.taskText}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-2">
                  <div className="text-gray-500">Answer</div>
                  <div className="whitespace-pre-wrap">{it.userAnswer}</div>
                </div>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------------------- helpers ---------------------- */

function emptyWriteState(): WriteState {
  return { topic: "", task: null, answer: "", attempt: null, loadingGen: false, loadingEval: false }
}
function emptyHistoryState(): HistoryState {
  return { items: [], loading: false, q: "" }
}
function patchWrite(s: Record<string, WriteState>, id: string, patch: Partial<WriteState>) {
  return { ...s, [id]: { ...s[id], ...patch } }
}
function patchHistory(s: Record<string, HistoryState>, id: string, patch: Partial<HistoryState>) {
  return { ...s, [id]: { ...s[id], ...patch } }
}
function randomTopic() {
  const topics = ["Reise", "Restaurant", "Arbeit", "Termin", "Gesundheit", "Einkaufen", "Freizeit", "Sport", "Wohnen", "Freunde"]
  return topics[Math.floor(Math.random() * topics.length)]
}
function cryptoRandomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID()
  return Math.random().toString(36).slice(2)
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }
function ModePicker({
  value, onChange,
}: { value: LexMode; onChange: (m: LexMode) => void }) {
  const modes: Array<{id: LexMode; label: string}> = [
    { id: "chat",              label: "Chat" },
    { id: "dict",              label: "Dict ask" },
    { id: "verb",              label: "Verb" },
    { id: "example_sentence",  label: "Examples" },
    { id: "translate_en_de",   label: "EN→DE" },
    { id: "translate_de_en",   label: "DE→EN" },
    { id: "synonym",           label: "Synonym" },
    { id: "antonym",           label: "Antonym" },
    { id: "get_infinitive",    label: "Get infinitive" },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {modes.map(m => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={`rounded-xl border px-3 py-1 text-sm ${value === m.id ? "bg-black text-white" : "bg-white"}`}
          aria-pressed={value === m.id}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

function LexOutput({ state }: { state: { mode: LexMode; result: any | null } }) {
  if (!state.result) return <div className="text-sm text-gray-500">No output yet.</div>
  const m = state.mode

  if (m === "chat") return <div className="whitespace-pre-wrap text-sm">{String(state.result)}</div>

  if (m === "dict") {
    const r = state.result as { headword?: string; senses?: any[] }
    return (
      <div className="grid gap-2">
        {r.headword && <h3 className="font-semibold">{r.headword}</h3>}
        <ul className="space-y-2">
          {(r.senses || []).map((s, i) => (
            <li key={i} className="rounded-xl bg-gray-50 p-3 text-sm">
              <div className="font-medium">{s.meaningEn} {s.pos ? <span className="text-gray-500">({s.pos})</span> : null}</div>
              {Array.isArray(s.examples) && s.examples.length ? (
                <ul className="mt-1 list-disc pl-5 text-gray-700">
                  {s.examples.map((ex: string, j: number) => <li key={j}>{ex}</li>)}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (m === "verb") {
    const r = state.result as any
    const t = r?.table || {}
    const row = (tense: string, cells?: any) => (
      <tr className="border-t" key={tense}>
        <td className="p-2 font-medium">{tense}</td>
        {"ich du er/sie/es wir ihr sie/Sie".split(" ").map((k) => (
          <td key={k} className="p-2">{cells?.[k] ?? (typeof cells === "string" ? cells : "-")}</td>
        ))}
      </tr>
    )
    return (
      <div className="grid gap-2 text-sm">
        <div><b>{r?.infinitive}</b>{r?.meaningEn ? <> — {r.meaningEn}</> : null}</div>
        <div className="overflow-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2">Tense/Mode</th>
                <th className="p-2">ich</th>
                <th className="p-2">du</th>
                <th className="p-2">er/sie/es</th>
                <th className="p-2">wir</th>
                <th className="p-2">ihr</th>
                <th className="p-2">sie/Sie</th>
              </tr>
            </thead>
            <tbody>
              {row("Präsens", t["Präsens"])}
              {row("Präteritum", t["Präteritum"])}
              {row("Perfekt", t["Perfekt"])}
              {row("Plusquamperfekt", t["Plusquamperfekt"])}
              {row("Konjunktiv I", t["Konjunktiv I"])}
              {row("Konjunktiv II", t["Konjunktiv II"])}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <div className="font-medium">Imperativ</div>
          <div>du: {t?.Imperativ?.du ?? "-"}</div>
          <div>ihr: {t?.Imperativ?.ihr ?? "-"}</div>
          <div>Sie: {t?.Imperativ?.Sie ?? "-"}</div>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <div className="font-medium">Partizip</div>
          <div>Partizip I: {t["Partizip I"] ?? "-"}</div>
          <div>Partizip II: {t["Partizip II"] ?? "-"}</div>
        </div>
      </div>
    )
  }

  if (m === "example_sentence") {
    const r = state.result as { sentences?: {de:string; en:string}[] }
    return (
      <ul className="space-y-2 text-sm">
        {(r.sentences || []).map((s, i) => (
          <li key={i} className="rounded-xl bg-gray-50 p-3">
            <div className="font-medium">{s.de}</div>
            <div className="text-gray-600">{s.en}</div>
          </li>
        ))}
      </ul>
    )
  }

  if (m === "translate_en_de" || m === "translate_de_en") {
    const r = state.result as any
    return (
      <div className="grid gap-2 text-sm">
        <div className="text-2xl font-semibold">{r.translation}</div>
        {Array.isArray(r.alternatives) && r.alternatives.length ? (
          <div>Alternatives: {r.alternatives.join(", ")}</div>
        ) : null}
        {r.notes && <div className="text-gray-700">{r.notes}</div>}
      </div>
    )
  }

  if (m === "synonym" || m === "antonym") {
    const r = state.result as { items?: {word:string; example?:{de:string; en:string}}[] }
    return (
      <ul className="space-y-2 text-sm">
        {(r.items || []).map((it, i) => (
          <li key={i} className="rounded-xl bg-gray-50 p-3">
            <b>{it.word}</b>
            {it.example ? (
              <div className="mt-1">
                <div>{it.example.de}</div>
                <div className="text-gray-600">{it.example.en}</div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    )
  }

  if (m === "get_infinitive") {
    const r = state.result as any
    return <div className="text-sm"><b>{r?.infinitive}</b>{r?.meaningEn ? <> — {r.meaningEn}</> : null}</div>
  }

  return <pre className="text-xs">{JSON.stringify(state.result, null, 2)}</pre>
}
