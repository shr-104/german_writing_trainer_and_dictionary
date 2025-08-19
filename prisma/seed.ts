// prisma/seed.ts
import { PrismaClient } from "@prisma/client"
import { GEN_TEMPLATE, EVAL_TEMPLATE } from "../lib/prompts"

const prisma = new PrismaClient()

async function main() {
  await prisma.promptTemplate.upsert({
    where: { name: "A2_Generate" },
    update: { content: GEN_TEMPLATE },
    create: { name: "A2_Generate", content: GEN_TEMPLATE },
  })
  await prisma.promptTemplate.upsert({
    where: { name: "A2_Evaluate" },
    update: { content: EVAL_TEMPLATE },
    create: { name: "A2_Evaluate", content: EVAL_TEMPLATE },
  })
}

main().finally(() => prisma.$disconnect())
