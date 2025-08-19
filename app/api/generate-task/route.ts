import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { MODELS } from "@/lib/models"
import { composeGeneratePrompt } from "@/lib/prompts"

export const dynamic = "force-dynamic"

type Body = { teil: 1 | 2; topic?: string; model?: string }

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

function controllerWithTimeout(ms: number) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return { controller, id }
}

// Local fallback if API is down
function mockTask(teil: 1 | 2, topic?: string) {
  const t = topic?.trim() ? ` (Thema: ${topic.trim()})` : ""
  if (teil === 1) {
    return [
      `Sie sind im Urlaub und wollen eine Woche länger bleiben${t}. Schreiben Sie Ihrem Freund/ Ihrer Freundin eine SMS:`,
      `- Erklären Sie, dass Sie länger bleiben.`,
      `- Nennen Sie einen Grund.`,
      `- Nennen Sie Ihr neues Ankunftsdatum und die Uhrzeit.`,
      ``,
      `Schreiben Sie 20-30 Wörter. Schreiben Sie zu allen Punkten.`,
    ].join("\n")
  }
  return [
    `Sie sind neu in der Firma${t}. Schreiben Sie Ihrer Kollegin/ Ihrem Kollegen eine E-Mail:`,
    `- Bedanken Sie sich für die Einladung.`,
    `- Sagen Sie, dass Sie heute nicht kommen können.`,
    `- Schlagen Sie einen anderen Tag vor.`,
    ``,
    `Schreiben Sie 30-40 Wörter. Schreiben Sie zu allen Punkten.`,
  ].join("\n")
}

export async function POST(req: NextRequest) {
  try {
    const { teil, topic, model: requestedModel } = (await req.json()) as Body
    const cleanTopic = typeof topic === "string" ? topic.trim() : ""
    if (teil !== 1 && teil !== 2) {
      return NextResponse.json({ error: "Invalid 'teil' (must be 1 or 2)" }, { status: 400 })
    }

    // Resolve model from whitelist or env
    const allowed = new Set(MODELS.map((m) => m.id))
    const model =
      (requestedModel && allowed.has(requestedModel) && requestedModel) ||
      process.env.OPENROUTER_MODEL ||
      MODELS[0]?.id

    const apiKey = process.env.OPENROUTER_API_KEY
    const prompt = composeGeneratePrompt(teil, cleanTopic)
    console.log(`[A2 Schreibtrainer] /api/generate-task using model: ${model}`)

    // No API? -> mock and still persist
    if (!apiKey || !model) {
      const taskText = mockTask(teil, topic)
      const task = await prisma.task.create({
        data: { teil, topic: cleanTopic || "random", prompt, taskText },
      })
      return NextResponse.json({ ...task, _note: "Mocked (no API key/model)" })
    }

    const { controller, id } = controllerWithTimeout(12_000)
    let taskText: string | null = null

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
          messages: [
            { role: "system", content: "Follow the instructions exactly. Output only the task text in German." },
            { role: "user", content: prompt },
          ],
        }),
      })
      clearTimeout(id)

      if (res.ok) {
        const data = await res.json()
        taskText = data?.choices?.[0]?.message?.content ?? null
      } else {
        const detail = await res.text().catch(() => "")
        console.warn("OpenRouter non-OK:", res.status, detail)
      }
    } catch (err) {
      clearTimeout(id)
      console.warn("OpenRouter error/timeout:", err)
    }

    if (!taskText || typeof taskText !== "string") {
      taskText = mockTask(teil, topic)
      const task = await prisma.task.create({
        data: { teil, topic: topic?.trim() || "random", prompt, taskText },
      })
      return NextResponse.json({ ...task, _note: "Mocked (timeout/network)" })
    }

    const task = await prisma.task.create({
      data: { teil, topic: topic?.trim() || "random", prompt, taskText },
    })
    return NextResponse.json(task)
  } catch (e: any) {
    console.error("generate-task error:", e)
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 })
  }
}
