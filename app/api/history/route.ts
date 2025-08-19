import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

const safeParse = (s: unknown) => {
  try { return typeof s === "string" ? JSON.parse(s) : (s ?? {}) } catch { return {} }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const teilParam = searchParams.get("teil")
  const teil = teilParam ? Number(teilParam) : undefined

  const where = teil === 1 || teil === 2 ? { task: { teil } } : {}

  const attempts = await prisma.attempt.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { task: true },
    take: 200,
  })

  const out = attempts.map((a) => ({
    ...a,
    scores: safeParse(a.scores),
    evaluation: safeParse(a.evaluation),
  }))

  return NextResponse.json(out)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const teilParam = searchParams.get("teil")
  const teil = teilParam ? Number(teilParam) : undefined

  // Delete attempts first; then delete tasks that have no attempts left
  if (teil === 1 || teil === 2) {
    await prisma.$transaction([
      prisma.attempt.deleteMany({ where: { task: { teil } } }),
      prisma.task.deleteMany({ where: { teil, attempts: { none: {} } } }),
    ])
  } else {
    await prisma.$transaction([
      prisma.attempt.deleteMany({}),
      prisma.task.deleteMany({ where: { attempts: { none: {} } } }),
    ])
  }

  return NextResponse.json({ ok: true })
}
