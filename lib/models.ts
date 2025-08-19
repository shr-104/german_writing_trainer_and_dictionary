// lib/models.ts
export type ModelDef = { id: string; label: string }

// Fill this with whatever OpenRouter models you want to expose
export const MODELS: ModelDef[] = [
  { id: "openai/gpt-5-chat", label: "OpenAI GPT-5 Chat"},
  { id: "openai/gpt-5-mini", label: "OpenAI GPT-5 Mini"},
  { id: "openai/gpt-5-nano", label: "OpenAI GPT-5 Nano"},
  { id: "openai/o4-mini-high", label: "OpenAI o4 Mini High" },
  { id: "openai/o4-mini", label: "OpenAI o4 Mini" },
  { id: "openai/o3-pro", label: "OpenAI o3 Pro"},
  { id: "openai/o3", label: "OpenAI o3"},
  { id: "openai/gpt-4o-mini", label: "OpenAI GPT-4o Mini" },
  { id: "openai/gpt-4.1", label: "OpenAI GPT-4.1" },
  { id: "openai/gpt-4.1-mini", label: "OpenAI GPT-4.1 Mini" },
  { id: "openai/gpt-4.1-nano", label: "OpenAI GPT-4.1 Nano" },
  // add more…
]

// Fallback if user hasn’t chosen anything
export const DEFAULT_MODEL = MODELS[0]?.id ?? "openai/gpt-5-chat"