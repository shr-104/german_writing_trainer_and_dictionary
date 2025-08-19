import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { MODELS } from "@/lib/models"
import { composeEvaluationPrompt } from "@/lib/prompts"

export const dynamic = "force-dynamic"

type Body = { taskId: string; userAnswer: string; model?: string }

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

function controllerWithTimeout(ms: number) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return { controller, id }
}

// Local fallback evaluation if API fails
function mockEvaluation() {
  return {
    scores: { Inhalt: 72, Grammatik: 65, Wortschatz: 70, Form: 78 },
    overall: 71,
    corrected: "Korrigierte Version…",
    mistakes: [{ text: "ich hat", explain: "Verbform falsch (haben)", fix: "ich habe" }],
    suggestionsA2: ["Nutzen Sie einfache Sätze.", "Achten Sie auf Artikel (der/die/das)."],
    suggestionsB1: ["Verbinden Sie Sätze mit Konnektoren (weil, dass, obwohl)."],
    glossary: [{ de: "Termin", en: "appointment" }],
    feedback: "Gute Basis, verbessern Sie Verbformen und Wortstellung.",
  }
}

export async function POST(req: NextRequest) {
  try {
    const { taskId, userAnswer, model: requestedModel } = (await req.json()) as Body
    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 })

    // Resolve model from whitelist or env
    const allowed = new Set(MODELS.map((m) => m.id))
    const model =
      (requestedModel && allowed.has(requestedModel) && requestedModel) ||
      process.env.OPENROUTER_MODEL ||
      MODELS[0]?.id

    console.log(`[A2 Schreibtrainer] /api/evaluate using model: ${model}`)

    const apiKey = process.env.OPENROUTER_API_KEY
    const prompt = composeEvaluationPrompt(task.taskText, userAnswer)

    let parsed: any
    if (!apiKey || !model) {
      parsed = mockEvaluation()
    } else {
      const { controller, id } = controllerWithTimeout(15_000)
      try {
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
            response_format: { type: "json_object" }, // ask router to enforce JSON
            messages: [
              { role: "system", content: "Reply with a single JSON object only. No extra text." },
              { role: "user", content: prompt },
            ],
          }),
        })
        clearTimeout(id)

        if (!res.ok) {
          console.warn("OpenRouter evaluate non-OK:", res.status, await res.text().catch(() => ""))
          parsed = mockEvaluation()
        } else {
          const data = await res.json()
          try {
            parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}")
          } catch {
            parsed = mockEvaluation()
          }
        }
      } catch (err) {
        clearTimeout(id)
        console.warn("OpenRouter evaluate error/timeout:", err)
        parsed = mockEvaluation()
      }
    }

    // Ensure overall if missing
    if (!Number.isFinite(parsed?.overall)) {
      const s = parsed?.scores || {}
      const vals = [s.Inhalt, s.Grammatik, s.Wortschatz, s.Form].map(Number).filter(Number.isFinite)
      parsed.overall = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
    }

    // Persist Attempt (serialize JSON for SQLite)
    const created = await prisma.attempt.create({
      data: {
        taskId: task.id,
        userAnswer,
        evaluation: JSON.stringify(parsed),
        scores: JSON.stringify(parsed?.scores ?? {}),
      },
      include: { task: true },
    })

    // Return parsed objects for the UI
    return NextResponse.json({
      ...created,
      evaluation: parsed,
      scores: parsed?.scores ?? {},
    })
  } catch (e: any) {
    console.error("evaluate error:", e)
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 })
  }
}
