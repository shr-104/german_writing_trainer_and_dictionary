"use client"

import { MODELS } from "@/lib/models"
import { useEffect, useRef, useState } from "react"

export default function ModelSelect({
  value,
  onChange,
}: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [hoverIdx, setHoverIdx] = useState(-1)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const current = MODELS.find((m) => m.id === value) ?? MODELS[0]

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!open) return
      const t = e.target as Node
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (open && e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  function selectAt(idx: number) {
    const item = MODELS[idx]
    if (!item) return
    onChange(item.id)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault()
      setOpen(true)
      setHoverIdx(Math.max(0, MODELS.findIndex((m) => m.id === value)))
      return
    }
    if (!open) return
    if (e.key === "ArrowDown") { e.preventDefault(); setHoverIdx((i) => (i + 1) % MODELS.length) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHoverIdx((i) => (i - 1 + MODELS.length) % MODELS.length) }
    else if (e.key === "Enter") { e.preventDefault(); selectAt(hoverIdx >= 0 ? hoverIdx : 0) }
    else if (e.key === "Escape") { setOpen(false) }
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate max-w-[22ch]">{current?.label}</span>
        <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7l5 6 5-6H5z" /></svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 z-50 mt-2 w-56 rounded-xl border bg-white p-1 shadow-lg"
          role="listbox"
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          <ul className="max-h-80 overflow-auto">
            {MODELS.map((m, i) => {
              const selected = m.id === value
              const hovered = i === hoverIdx
              return (
                <li
                  key={m.id}
                  role="option"
                  aria-selected={selected}
                  className={`cursor-pointer rounded-lg px-2 py-1 text-sm ${
                    selected ? "bg-gray-100 font-medium" : hovered ? "bg-gray-50" : ""
                  }`}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(-1)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectAt(i)}
                >
                  {m.label}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
