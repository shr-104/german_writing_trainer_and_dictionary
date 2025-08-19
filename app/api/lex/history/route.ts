import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

// GET  /api/lex/history?mode=verb&limit=50&q=gehen
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get("mode") || undefined
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200)
  const q = searchParams.get("q") || ""

  const where: any = {}
  if (mode && mode !== "all") where.mode = mode
  if (q) where.OR = [{ text: { contains: q } }, { result: { contains: q } }]

  const items = await prisma.lexLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  const parsed = items.map((it) => ({
    ...it,
    resultObj: (() => { try { return JSON.parse(it.result) } catch { return null } })(),
  }))

  return NextResponse.json({ items: parsed })
}

// DELETE /api/lex/history (optional: ?mode=verb)
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get("mode") || undefined
  const where: any = {}
  if (mode && mode !== "all") where.mode = mode
  const { count } = await prisma.lexLog.deleteMany({ where })
  return NextResponse.json({ ok: true, deleted: count })
}
