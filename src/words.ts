export const LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1'] as const
export type Level = (typeof LEVELS)[number]

export interface Word {
  id: string // "decide.verb"
  word: string
  pos: string
  level: string // "A2"
  ipa: string | null // American IPA, e.g. "/dɪˈsaɪd/"
  az: string
  example: string
  example_ipa: string
  example_az: string
  note?: string
  syllabus?: boolean
  audio?: string // "audio/decide.verb.mp3"
  audio_example?: string
}

export interface WordBase {
  byLevel: Partial<Record<Level, Word[]>>
  byId: Map<string, Word>
}

/**
 * Order in which new words are introduced: syllabus words first, then the rest
 * round-robin by part of speech (verb, noun, adjective, adverb, ...) so each day
 * brings a mix instead of 70 verbs in a row. Deterministic, so the order is stable.
 */
function studyOrder(words: Word[]): Word[] {
  const syllabus = words.filter((w) => w.syllabus)
  const groups = new Map<string, Word[]>()
  for (const w of words) {
    if (w.syllabus) continue
    if (!groups.has(w.pos)) groups.set(w.pos, [])
    groups.get(w.pos)!.push(w)
  }
  const queues = [...groups.values()]
  const mixed: Word[] = []
  for (let i = 0; mixed.length < words.length - syllabus.length; i++) {
    for (const q of queues) if (i < q.length) mixed.push(q[i])
  }
  return [...syllabus, ...mixed]
}

/** Loads every level that has been built (public/words/<level>.json); missing levels are skipped. */
export async function loadWords(): Promise<WordBase> {
  const results = await Promise.allSettled(
    LEVELS.map(async (level) => {
      const res = await fetch(`words/${level}.json`)
      if (!res.ok) throw new Error(`${level}: ${res.status}`)
      return [level, (await res.json()) as Word[]] as const
    }),
  )
  const byLevel: WordBase['byLevel'] = {}
  const byId = new Map<string, Word>()
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    const [level, words] = r.value
    byLevel[level] = studyOrder(words)
    for (const w of words) byId.set(w.id, w)
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
}
