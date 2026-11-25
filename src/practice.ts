import { db } from './db'
import { isPhrase, type Word, type WordBase } from './words'

export type Mode = 'build' | 'cloze' | 'dictation' | 'translate'

export const MODES: { id: Mode; icon: string; label: string; hint: string }[] = [
  { id: 'build', icon: '🧩', label: 'Cümləni yığ', hint: 'Sözləri düzgün sıraya düz' },
  { id: 'cloze', icon: '✏️', label: 'Boşluğu doldur', hint: 'Çatışmayan sözü yaz' },
  { id: 'dictation', icon: '🎧', label: 'Dinlə və yaz', hint: 'Eşitdiyin cümləni yaz' },
  { id: 'translate', icon: '🔁', label: 'Tərcümə et', hint: 'Azərbaycanca cümləni ingiliscə yaz' },
]

export const SESSION_LENGTH = 10
export const MIN_POOL = 5

export interface Exercise {
  mode: Mode
  item: Word
  tokens: string[] // the English sentence split into words (with punctuation attached)
  blank?: number // cloze: index of the hidden token
  tiles?: string[] // build: shuffled tokens
}

/** Words and phrases the learner has already studied, weakest (lowest stability) first. */
export async function practicePool(words: WordBase): Promise<Word[]> {
  const progress = await db.progress.toArray()
  return progress
    .filter((p) => words.byId.has(p.wordId))
    .sort((a, b) => a.card.stability - b.card.stability)
    .map((p) => words.byId.get(p.wordId)!)
}

export const tokenize = (sentence: string) => sentence.trim().split(/\s+/)

/** Lowercase, unify apostrophes, drop punctuation: "Don't!" -> "don't" */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Index of the token that is the target word (decided, children's...), or -1. */
function findTarget(item: Word, tokens: string[]): number {
  const heads = isPhrase(item) ? (item.words ?? []) : [item.word]
  for (const head of heads) {
    const h = normalize(head)
    if (!h || h.includes(' ')) continue
    const stem = h.length > 4 ? h.replace(/(e|y)$/, '') : h
    const i = tokens.findIndex((t) => {
      const n = normalize(t)
      return n === h || (n.startsWith(stem) && n.length - h.length <= 3)
    })
    if (i >= 0) return i
  }
  return -1
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function makeExercise(mode: Mode, item: Word): Exercise | null {
  const tokens = tokenize(item.example)
  if (mode === 'build') {
    if (tokens.length < 3 || tokens.length > 14) return null
    let tiles = shuffle(tokens)
    for (let i = 0; i < 5 && tiles.join(' ') === tokens.join(' '); i++) tiles = shuffle(tokens)
    return { mode, item, tokens, tiles }
  }
  if (mode === 'cloze') {
    const blank = findTarget(item, tokens)
    return blank < 0 ? null : { mode, item, tokens, blank }
  }
  if (mode === 'dictation' && !item.audio_example) return null
  return { mode, item, tokens }
}

/**
 * A practice session: weak items are more likely, each item appears once.
 * mode 'mixed' rotates through all exercise types.
 */
export function buildSession(pool: Word[], mode: Mode | 'mixed'): Exercise[] {
  // Weighted pick: the weakest third of the pool is three times as likely.
  const weak = pool.slice(0, Math.max(MIN_POOL, Math.ceil(pool.length / 3)))
  const candidates = shuffle([...weak, ...weak, ...pool])
  const used = new Set<string>()
  const out: Exercise[] = []
  for (const item of candidates) {
    if (out.length >= SESSION_LENGTH) break
    if (used.has(item.id)) continue
    const m = mode === 'mixed' ? MODES[out.length % MODES.length].id : mode
    const ex = makeExercise(m, item)
    if (!ex) continue
    used.add(item.id)
    out.push(ex)
  }
  return out
}

export interface DiffToken {
  text: string
  status: 'ok' | 'missing' | 'extra'
}

/** Word-level diff of the learner's answer against the reference (longest common subsequence). */
export function diffWords(answer: string, reference: string): DiffToken[] {
  const a = tokenize(answer).filter((t) => normalize(t))
  const r = tokenize(reference)
  const an = a.map(normalize)
  const rn = r.map(normalize)
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(r.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = r.length - 1; j >= 0; j--)
      dp[i][j] = an[i] === rn[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: DiffToken[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < r.length) {
    if (an[i] === rn[j]) {
      out.push({ text: r[j], status: 'ok' })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ text: a[i++], status: 'extra' })
    else out.push({ text: r[j++], status: 'missing' })
  }
  while (i < a.length) out.push({ text: a[i++], status: 'extra' })
  while (j < r.length) out.push({ text: r[j++], status: 'missing' })
  return out
}

export const isCorrect = (answer: string, reference: string) => normalize(answer) === normalize(reference)

export async function recordPractice(mode: Mode, itemId: string, correct: boolean) {
  await db.practice.add({ at: Date.now(), mode, itemId, correct })
}
