import { DefaultScheduler, Rating } from 'ts-fsrs'
import { db, studyDay, type FsrsCard, type Progress, type Settings } from './db'
import type { Word, WordBase } from './words'

export { Rating }
export type Grade = 1 | 2 | 3 | 4

type Scheduler = Awaited<ReturnType<typeof DefaultScheduler>>

/** Learning cards due within this window are shown early instead of ending the session (Anki does the same). */
const LEARN_AHEAD_MS = 20 * 60_000
/** A word counts as "learned" once FSRS expects to remember it for 3+ weeks. */
export const MATURE_STABILITY_DAYS = 21

let cached: { retention: number; scheduler: Scheduler } | null = null

export async function getScheduler(settings: Settings): Promise<Scheduler> {
  if (cached?.retention !== settings.desiredRetention) {
    const scheduler = await DefaultScheduler({
      desiredRetention: settings.desiredRetention,
      enableFuzz: true,
      // Anki-style same-day steps: a new word answered Good comes back in 10 minutes
      // before moving to day intervals; a forgotten word comes back in 10 minutes.
      enableShortTerm: true,
      learningSteps: ['1m', '10m'],
      relearningSteps: ['10m'],
      allowModelOverride: false,
    })
    cached = { retention: settings.desiredRetention, scheduler }
  }
  return cached.scheduler
}

export interface StudyItem {
  word: Word
  progress: Progress | null // null = new word
}

export interface TodayCounts {
  due: number // reviews/learning cards due now
  newLeft: number // new words still allowed today
  reviewedToday: number
}

async function newWordsLeft(settings: Settings): Promise<number> {
  const introduced = await db.progress.where('introducedOn').equals(studyDay()).count()
  return Math.max(0, settings.newPerDay - introduced)
}

/** Next new word: first word (in level order, then file order) that has never been shown. */
async function nextNewWord(words: WordBase, settings: Settings): Promise<Word | null> {
  const seen = new Set(await db.progress.toCollection().primaryKeys())
  for (const level of settings.levels) {
    const list = words.byLevel[level as keyof WordBase['byLevel']] ?? []
    const w = list.find((x) => !seen.has(x.id))
    if (w) return w
  }
  return null
}

/** Picks what to show next: due cards first, then a new word, then learning cards due soon. */
export async function nextItem(words: WordBase, settings: Settings): Promise<StudyItem | null> {
  const now = Date.now()
  const known = (p: Progress | undefined) => (p && words.byId.has(p.wordId) ? p : undefined)

  const due = await db.progress.where('dueAt').belowOrEqual(now).filter((p) => words.byId.has(p.wordId)).first()
  if (known(due)) return { word: words.byId.get(due!.wordId)!, progress: due! }

  if ((await newWordsLeft(settings)) > 0) {
    const w = await nextNewWord(words, settings)
    if (w) return { word: w, progress: null }
  }

  const soon = await db.progress
    .where('dueAt')
    .between(now, now + LEARN_AHEAD_MS, true, true)
    .filter((p) => words.byId.has(p.wordId) && (p.card.state === 1 || p.card.state === 3))
    .first()
  if (known(soon)) return { word: words.byId.get(soon!.wordId)!, progress: soon! }
  return null
}

export async function todayCounts(words: WordBase, settings: Settings): Promise<TodayCounts> {
  const now = Date.now()
  const due = await db.progress.where('dueAt').belowOrEqual(now).filter((p) => words.byId.has(p.wordId)).count()
  const introducedIds = new Set(await db.progress.toCollection().primaryKeys())
  const unseen = settings.levels.reduce(
    (n, l) => n + (words.byLevel[l as keyof WordBase['byLevel']] ?? []).filter((w) => !introducedIds.has(w.id)).length,
    0,
  )
  return {
    due,
    newLeft: Math.min(await newWordsLeft(settings), unseen),
    reviewedToday: await db.reviews.where('day').equals(studyDay()).count(),
  }
}

/** How long until the card comes back for each button, e.g. { 1: "1 dəq", 3: "4 gün" }. */
export async function previewIntervals(item: StudyItem, settings: Settings): Promise<Record<Grade, string>> {
  const scheduler = await getScheduler(settings)
  const now = new Date()
  const card = (item.progress?.card ?? scheduler.newCard({ now })) as never
  const out = {} as Record<Grade, string>
  for (const p of scheduler.preview({ card, now })) {
    out[p.grade as Grade] = formatInterval((p.card as unknown as FsrsCard).dueAt.getTime() - now.getTime())
  }
  return out
}

export async function answer(item: StudyItem, grade: Grade, settings: Settings, durationMs: number) {
  const scheduler = await getScheduler(settings)
  const now = new Date()
  const before = (item.progress?.card ?? scheduler.newCard({ now })) as never
  const result = scheduler.review({ card: before, grade, now })
  const card = result.card as unknown as FsrsCard

  await db.transaction('rw', db.progress, db.reviews, async () => {
    await db.progress.put({
      wordId: item.word.id,
      card,
      dueAt: card.dueAt.getTime(),
      introducedOn: item.progress?.introducedOn ?? studyDay(now),
    })
    await db.reviews.add({
      wordId: item.word.id,
      at: now.getTime(),
      day: studyDay(now),
      rating: grade,
      state: item.progress?.card.state ?? 0,
      durationMs,
    })
  })
}

export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return `${min} dəq`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours} saat`
  const days = Math.round(hours / 24)
  if (days < 31) return `${days} gün`
  const months = Math.round(days / 30.4)
  if (months < 12) return `${months} ay`
  return `${(days / 365).toFixed(1).replace('.0', '')} il`
}

// ---------- statistics ----------

export interface LevelStats {
  level: string
  total: number
  seen: number
  learned: number // stability >= MATURE_STABILITY_DAYS
}

export async function levelStats(words: WordBase): Promise<LevelStats[]> {
  const all = new Map((await db.progress.toArray()).map((p) => [p.wordId, p]))
  return Object.entries(words.byLevel).map(([level, list]) => {
    let seen = 0
    let learned = 0
    for (const w of list ?? []) {
      const p = all.get(w.id)
      if (!p) continue
      seen++
      if (p.card.stability >= MATURE_STABILITY_DAYS) learned++
    }
    return { level, total: list?.length ?? 0, seen, learned }
  })
}

/** Consecutive study days with at least one review, ending today (or yesterday if not studied yet today). */
export async function streak(): Promise<number> {
  const days = new Set((await db.reviews.orderBy('day').uniqueKeys()) as string[])
  const d = new Date()
  let count = 0
  if (!days.has(studyDay(d))) d.setDate(d.getDate() - 1)
  while (days.has(studyDay(d))) {
    count++
    d.setDate(d.getDate() - 1)
  }
  return count
}
