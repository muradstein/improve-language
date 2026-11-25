export const LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1'] as const
export type Level = (typeof LEVELS)[number]

/** A study item: a single word, or a collocation/expression (pos "collocation" | "expression"). */
export interface Word {
  id: string // "decide.verb", "make-a-decision.phrase"
  word: string
  pos: string
  level: string // "A2"
  ipa: string | null // American IPA, e.g. "/dɪˈsaɪd/"
  az: string
  example: string
  example_ipa: string
  example_az: string
  note?: string
  usage?: string // phrases: when it is used
  words?: string[] // phrases: headwords it is built from
  syllabus?: boolean
  audio?: string // "audio/decide.verb.mp3"
  audio_example?: string
}

export interface WordBase {
  byLevel: Partial<Record<Level, Word[]>> // words and phrases, in study order
  byId: Map<string, Word>
}

export const isPhrase = (w: Word) => w.pos === 'collocation' || w.pos === 'expression'

/** New words: one phrase after every PHRASE_EVERY words. */
const PHRASE_EVERY = 4

/**
 * Order in which new items are introduced: syllabus items first, then words
 * round-robin by part of speech (verb, noun, adjective, ...) so each day brings a mix,
 * with a collocation/expression after every few words. Deterministic, so the order is stable.
 */
function studyOrder(words: Word[], phrases: Word[]): Word[] {
  const syllabus = [...words.filter((w) => w.syllabus), ...phrases.filter((p) => p.syllabus)]
  const groups = new Map<string, Word[]>()
  for (const w of words) {
    if (w.syllabus) continue
    if (!groups.has(w.pos)) groups.set(w.pos, [])
    groups.get(w.pos)!.push(w)
  }
  const queues = [...groups.values()]
  const total = queues.reduce((n, q) => n + q.length, 0)
  const mixed: Word[] = []
  for (let i = 0; mixed.length < total; i++) {
    for (const q of queues) if (i < q.length) mixed.push(q[i])
  }
  const restPhrases = phrases.filter((p) => !p.syllabus)
  const out: Word[] = [...syllabus]
  mixed.forEach((w, i) => {
    out.push(w)
    if ((i + 1) % PHRASE_EVERY === 0 && restPhrases.length) out.push(restPhrases.shift()!)
  })
  return [...out, ...restPhrases]
}

async function fetchList(path: string): Promise<Word[]> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return (await res.json()) as Word[]
}

/** Loads every level that has been built (public/words/<level>.json, public/phrases/<level>.json). */
export async function loadWords(): Promise<WordBase> {
  const results = await Promise.all(
    LEVELS.map(async (level) => {
      const [words, phrases] = await Promise.allSettled([
        fetchList(`words/${level}.json`),
        fetchList(`phrases/${level}.json`),
      ])
      return {
        level,
        words: words.status === 'fulfilled' ? words.value : [],
        phrases: phrases.status === 'fulfilled' ? phrases.value : [],
      }
    }),
  )
  const byLevel: WordBase['byLevel'] = {}
  const byId = new Map<string, Word>()
  for (const { level, words, phrases } of results) {
    if (!words.length && !phrases.length) continue
    byLevel[level] = studyOrder(words, phrases)
    for (const w of [...words, ...phrases]) byId.set(w.id, w)
  }
  return { byLevel, byId }
}

export const POS_AZ: Record<string, string> = {
  verb: 'fel',
  noun: 'isim',
  adjective: 'sifət',
  adverb: 'zərf',
  preposition: 'sözönü',
  conjunction: 'bağlayıcı',
  pronoun: 'əvəzlik',
  determiner: 'təyinedici',
  interjection: 'nida',
  collocation: 'söz birləşməsi',
  expression: 'ifadə',
}
