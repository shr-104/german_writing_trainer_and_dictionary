// lib/prompts.ts

export const GEN_TEMPLATE = `Suppose that you are a strict A2 Goethe examiner

You must answer me in english, except when you send me task (task must in german)

Now you have 2 Task:

- Give me task when I send (Teil_x)_(Topic) (if no (Topic) then randomize the topic) with this form:

+ if Teil 1:

<Task context, send SMS for something>

<3 requirements>

<Schreiben Sie 20-30 Wörter. Schreiben Sie zu allen Punkten.>

for example:

Sie sind im Urlaub und wollen eine Woche länger bleiben. Schreiben Sie Ihrem Freund Lukas eine SMS:

- Erklären Sie ihm, dass Sie länger bleiben.
- Schreiben Sie, warum.
- Nennen Sie Ihr neues Ankunftsdatum und die Uhrzeit.

Schreiben Sie 20-30 Wörter. Schreiben Sie zu allen Punkten.

+ if Teil 2:

<Task context, send E-Mail for something>

<3 requirements>

<Schreiben Sie 30-40 Wörter. Schreiben Sie zu allen Punkten.>

for example:

Sie sind neu in der Firma und eine Kollegin, Frau König, möchte Sie besser kennenlernen. Sie hat Sie heute in ein Restaurant eingeladen. Schreiben Sie Frau König eine E-Mail:

- Bedanken Sie sich und sagen Sie, dass Sie heute nicht kommen können.
- Schlagen Sie einen anderen Tag vor.
- Fragen Sie nach dem Weg zu dem Restaurant.

Schreiben Sie 30-40 Wörter. Schreiben Sie zu allen drei Punkten.

You must answer me in english, except when you send me task (task must in german)
`;

export const EVAL_TEMPLATE = `rate in different criteria like A2-geothe level, give me score (0-100) for each criteria, the overall score, also with corrected version, spot where I wrote wrong, and some suggestion for A2 and B1 level. If there is some suggestion word (german word), then give me the english translation too.`;

// Compose the final user prompts we send to the model
export function composeGeneratePrompt(teil: 1|2, topic?: string) {
  return `${GEN_TEMPLATE}

Now generate for request: (Teil_${teil})_${topic || "RANDOM"}
Remember: Output the TASK **in German only** (no English).`;
}

export function composeEvaluationPrompt(taskText: string, userAnswer: string) {
  // We ask for a strict JSON object so our API can parse it safely.
  // Feel free to tweak criteria or add fields.
  return `You must answer me in english. You are a strict A2 Goethe examiner.

${EVAL_TEMPLATE}

Task (German):
${taskText}

Student answer (German):
${userAnswer}

Return a JSON object with this structure ONLY:
{
  "scores": { "Inhalt": number, "Grammatik": number, "Wortschatz": number, "Form": number },
  "overall": number,                         // 0-100 overall score (you compute)
  "corrected": string,                       // corrected version of the student's text (A2 level)
  "mistakes": [                              // list specific mistakes with short explanations
    { "text": "original snippet", "explain": "what is wrong", "fix": "fixed snippet" }
  ],
  "suggestionsA2": [ "tip 1", "tip 2" ],
  "suggestionsB1": [ "tip 1", "tip 2" ],
  "glossary": [                              // suggested words with EN translation
    { "de": "Wort", "en": "word" }
  ],
  "feedback": "feedback"
}`;
}

export type LexMode =
  | "chat"
  | "dict"                // translate + all senses with examples
  | "verb"                // meaning + full conjugation table
  | "example_sentence"    // several example sentences
  | "translate_en_de"
  | "translate_de_en"
  | "synonym"
  | "antonym"
  | "get_infinitive"

export function composeLexMessages(mode: LexMode, text: string) {
  const clean = (text || "").trim()
  const baseSystem =
    "You are a bilingual German↔English dictionary, grammar tutor, and strict formatter. " +
    "Always be accurate. Never include unsafe content."

  // Modes that should return JSON we can render nicely
  const jsonModes: LexMode[] = [
    "dict",
    "verb",
    "example_sentence",
    "translate_en_de",
    "translate_de_en",
    "synonym",
    "antonym",
    "get_infinitive",
  ]

  if (mode === "chat") {
    return {
      responseFormat: "text" as const,
      messages: [
        { role: "system", content: baseSystem + " Be concise. If user writes German, answer in German; if English, answer in English." },
        { role: "user", content: clean || "Hallo!" },
      ],
    }
  }

  // JSON-only formats per tool
  const instructions: Record<Exclude<LexMode, "chat">, string> = {
    dict: `
Return a JSON object with:
{
  "headword": "…",
  "senses": [
    { "meaningEn": "…", "pos": "noun|verb|adj|adv|prep|…", "examples": ["de → en", "…"] }
  ]
}
Explain only via the JSON fields; do not add extra keys.`,
    verb: `
Given a German verb (any form), return JSON with its infinitive, an English meaning, and conjugations:
{
  "infinitive": "…",
  "meaningEn": "…",
  "table": {
    "Präsens":     {"ich":"…","du":"…","er/sie/es":"…","wir":"…","ihr":"…","sie/Sie":"…"},
    "Präteritum":  {"ich":"…","du":"…","er/sie/es":"…","wir":"…","ihr":"…","sie/Sie":"…"},
    "Perfekt":     {"ich":"…","du":"…","er/sie/es":"…","wir":"…","ihr":"…","sie/Sie":"…"},
    "Plusquamperfekt":{"ich":"…","du":"…","er/sie/es":"…","wir":"…","ihr":"…","sie/Sie":"…"},
    "Konjunktiv I":{"ich":"…","du":"…","er/sie/es":"…","wir":"…","ihr":"…","sie/Sie":"…"},
    "Konjunktiv II":{"ich":"…","du":"…","er/sie/es":"…","wir":"…","ihr":"…","sie/Sie":"…"},
    "Imperativ":   {"du":"…","ihr":"…","Sie":"…"},
    "Partizip I":  "…",
    "Partizip II": "…"
  }
}
Use standard, taught forms.`,
    example_sentence: `
Return JSON:
{ "headword": "…", "sentences": [{"de":"…","en":"…"}] }
Make 3–5 simple A2/B1 examples.`,
    translate_en_de: `
Translate EN→DE. Return JSON:
{ "source":"en", "target":"de", "translation":"…", "alternatives":["…","…"], "notes":"(short tips if useful)" }`,
    translate_de_en: `
Translate DE→EN. Return JSON:
{ "source":"de", "target":"en", "translation":"…", "alternatives":["…","…"], "notes":"(short tips if useful)" }`,
    synonym: `
Return at most 5 synonyms. JSON:
{ "headword":"…", "items":[{"word":"…","example":{"de":"…","en":"…"}}] }`,
    antonym: `
Return at most 5 antonyms. JSON:
{ "headword":"…", "items":[{"word":"…","example":{"de":"…","en":"…"}}] }`,
    get_infinitive: `
If input is a German verb (any form), return JSON:
{ "infinitive":"…", "meaningEn":"…"}`
  }

  return {
    responseFormat: "json" as const,
    messages: [
      { role: "system", content: baseSystem + " Respond with a single JSON object only. No prose outside JSON." },
      { role: "user", content: `Mode: ${mode}\nInput: ${clean}\n\n${instructions[mode]}` },
    ],
  }
}