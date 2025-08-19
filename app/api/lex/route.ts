import { NextRequest, NextResponse } from "next/server"
import { MODELS } from "@/lib/models"
import { composeLexMessages, type LexMode } from "@/lib/prompts"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

type Body = { mode: LexMode; text: string; model?: string }

function withTimeout(ms: number) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return { controller, id }
}

// Small offline mocks so the UI still works without a key
function mock(mode: LexMode, text: string) {
  if (mode === "chat") return "Hallo! (offline mock)"
  if (mode === "verb") return {
    infinitive: "gehen",
    meaningEn: "to go",
    table: {
      "Präsens": {"ich":"gehe","du":"gehst","er/sie/es":"geht","wir":"gehen","ihr":"geht","sie/Sie":"gehen"},
      "Präteritum":{"ich":"ging","du":"gingst","er/sie/es":"ging","wir":"gingen","ihr":"gingt","sie/Sie":"gingen"},
      "Perfekt":{"ich":"bin gegangen","du":"bist gegangen","er/sie/es":"ist gegangen","wir":"sind gegangen","ihr":"seid gegangen","sie/Sie":"sind gegangen"},
      "Plusquamperfekt":{"ich":"war gegangen","du":"warst gegangen","er/sie/es":"war gegangen","wir":"waren gegangen","ihr":"wart gegangen","sie/Sie":"waren gegangen"},
      "Konjunktiv I":{"ich":"gehe","du":"gehest","er/sie/es":"gehe","wir":"gehen","ihr":"gehet","sie/Sie":"gehen"},
      "Konjunktiv II":{"ich":"ginge","du":"gingest","er/sie/es":"ginge","wir":"gingen","ihr":"ginget","sie/Sie":"gingen"},
      "Imperativ":{"du":"geh!","ihr":"geht!","Sie":"Gehen Sie!"},
      "Partizip I":"gehend",
      "Partizip II":"gegangen",
    }
  }
  if (mode === "dict") return {
    headword: text || "Beispiel",
    senses: [{ meaningEn: "example/sample", pos: "noun", examples: ["ein Beispiel geben → give an example"] }]
  }
  if (mode === "synonym" || mode === "antonym") return { headword: text, items: [{ word: "Probe", example: { de: "Das ist nur eine Probe.", en: "That's just a sample." } }] }
  if (mode === "example_sentence") return { headword: text, sentences: [{ de: "Das ist ein Beispiel.", en: "This is an example." }] }
  if (mode === "get_infinitive") return { infinitive: "gehen", meaningEn: "to go" }
  if (mode === "translate_en_de") return { source: "en", target: "de", translation: "Beispiel", alternatives: ["Muster"], notes: "" }
  if (mode === "translate_de_en") return { source: "de", target: "en", translation: "example", alternatives: ["sample"], notes: "" }
  return { note: "unknown mode" }
}

// ✅ This named export is REQUIRED by Next.js App Router
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Body>
    const mode = (body?.mode ?? "chat") as LexMode
    const text = typeof body?.text === "string" ? body!.text : ""
    const requestedModel = body?.model

    const allowed = new Set(MODELS.map(m => m.id))
    const model =
      (requestedModel && allowed.has(requestedModel) && requestedModel) ||
      process.env.OPENROUTER_MODEL ||
      MODELS[0]?.id

    const { messages, responseFormat } = composeLexMessages(mode, text)
    console.log(`[A2 Schreibtrainer] /api/lex mode=${mode} model=${model}`)

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey || !model) {
      return NextResponse.json({ data: mock(mode, text), _note: "mock" })
    }

    const { controller, id } = withTimeout(12_000)
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "A2 Schreibtrainer (Local Dev)",
      },
      body: JSON.stringify({
        model,
        ...(responseFormat === "json" ? { response_format: { type: "json_object" } } : {}),
        messages,
      }),
    })
    clearTimeout(id)

    if (!res.ok) {
      console.warn("OpenRouter non-OK:", res.status, await res.text().catch(() => ""))
      return NextResponse.json({ data: mock(mode, text), _note: "mock" })
    }

    const data = await res.json()
    const out = responseFormat === "json"
      ? JSON.parse(data?.choices?.[0]?.message?.content ?? "{}")
      : (data?.choices?.[0]?.message?.content ?? "")
    await prisma.lexLog.create({
    data: {
        mode,
        text,
        result: JSON.stringify(out),
        model,
    },
    })
    return NextResponse.json({ data: out })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 })
  }
}

// (Optional) helpful GET so you can ping the route in a browser
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/lex", methods: ["POST"] })
}
