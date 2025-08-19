"use client"
import { useEffect, useState } from "react"
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts"

type Task = { id: string; teil: number; topic: string; taskText: string }
type Attempt = { id: string; scores: Record<string, number>; evaluation: any }

export default function Home() {
  const [activeTab, setActiveTab] = useState<1|2>(1)
  const [topic, setTopic] = useState("")
  const [task, setTask] = useState<Task|null>(null)
  const [answer, setAnswer] = useState("")
  const [attempt, setAttempt] = useState<Attempt|null>(null)
  const [history, setHistory] = useState<any[]>([])

  useEffect(() => {
    fetch("/api/history").then(r=>r.json()).then(setHistory)
  }, [])

  async function generateTask() {
    const res = await fetch("/api/generate-task", {
      method: "POST",
      body: JSON.stringify({ teil: activeTab, topic }),
    })
    const t = await res.json()
    setTask(t)
    setAttempt(null)
    setAnswer("")
  }

  async function evaluate() {
    if (!task) return
    const res = await fetch("/api/evaluate", {
      method: "POST",
      body: JSON.stringify({ taskId: task.id, userAnswer: answer }),
    })
    const a = await res.json()
    setAttempt(a)
    setHistory([a, ...history])
  }

  const pieData = attempt
    ? Object.entries(attempt.scores).map(([name, value]) => ({ name, value }))
    : []

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold mb-4">A2 Schreibtrainer</h1>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        {[1,2].map((n)=>(
          <button
            key={n}
            onClick={()=>setActiveTab(n as 1|2)}
            className={`rounded-xl px-3 py-2 border ${activeTab===n ? "bg-brand-600 text-white" : "bg-white"}`}
          >
            Teil {n}
          </button>
        ))}
      </div>

      {/* Generate */}
      <div className="grid gap-3 rounded-2xl border p-4">
        <div className="flex gap-2">
          <input
            value={topic}
            onChange={(e)=>setTopic(e.target.value)}
            placeholder="Topic (optional)"
            className="flex-1 rounded-xl border px-3 py-2"
          />
          <button onClick={generateTask} className="rounded-xl bg-black text-white px-4 py-2">Generate task</button>
        </div>

        {task && (
          <div className="rounded-xl bg-gray-50 p-3">
            <div className="text-sm text-gray-500">Task (Teil {task.teil})</div>
            <p className="whitespace-pre-wrap">{task.taskText}</p>
          </div>
        )}

        {/* Answer */}
        <textarea
          value={answer}
          onChange={(e)=>setAnswer(e.target.value)}
          placeholder="Write your answer here…"
          className="min-h-[120px] rounded-xl border p-3"
        />

        <button onClick={evaluate} className="self-start rounded-xl bg-brand-600 text-white px-4 py-2">Evaluate</button>

        {/* Pie chart */}
        {attempt && pieData.length > 0 && (
          <div className="rounded-2xl border p-4">
            <h3 className="mb-2 font-semibold">Score by criteria</h3>
            <PieChart width={360} height={240}>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} />
              <Tooltip />
              <Legend />
            </PieChart>
          </div>
        )}
      </div>

      {/* History */}
      <section className="mt-6">
        <h2 className="mb-2 text-xl font-semibold">History</h2>
        <HistoryList />
      </section>
    </main>
  )
}

function HistoryList() {
  const [items, setItems] = useState<any[]>([])
  useEffect(()=>{ fetch("/api/history").then(r=>r.json()).then(setItems) }, [])
  return (
    <ul className="space-y-2">
      {items.map((it)=>(
        <li key={it.id} className="rounded-xl border p-3">
          <div className="text-sm text-gray-500">{new Date(it.createdAt).toLocaleString()}</div>
          <div className="text-sm">Scores: {Object.entries(it.scores).map(([k,v])=>`${k}: ${v}`).join(" | ")}</div>
        </li>
      ))}
    </ul>
  )
}
