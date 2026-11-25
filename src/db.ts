import Dexie, { type EntityTable } from 'dexie'

/** Scheduling state of one word. `card` is the ts-fsrs card object, stored as-is. */
export interface Progress {
  wordId: string
  card: FsrsCard
  dueAt: number // copy of card.dueAt in ms, indexed for "what is due now"
  introducedOn: string // study day the word was first shown, for the daily new-word limit
}

export interface ReviewLog {
  id?: number
  wordId: string
  at: number // ms
  day: string // study day, "2026-11-25"
  rating: number // 1 Again, 2 Hard, 3 Good, 4 Easy
  state: number // card state before the review
  durationMs: number
}

export interface Setting {
  key: string
  value: unknown
}

// ts-fsrs card as returned by the scheduler (FSRS-7 adds fields; we keep everything).
export type FsrsCard = Record<string, unknown> & { dueAt: Date; state: number; stability: number }

export const db = new Dexie('improve') as Dexie & {
  progress: EntityTable<Progress, 'wordId'>
  reviews: EntityTable<ReviewLog, 'id'>
  settings: EntityTable<Setting, 'key'>
}

db.version(1).stores({
  progress: 'wordId, dueAt, introducedOn',
  reviews: '++id, wordId, at, day',
  settings: 'key',
})

/** A study day starts at 04:00 local time, like Anki, so late-night reviews count for "today". */
export function studyDay(date = new Date()): string {
  const d = new Date(date.getTime() - 4 * 3600_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---------- settings ----------

export interface Settings {
  newPerDay: number
  desiredRetention: number
  autoplay: boolean
  levels: string[] // levels new words are taken from, in order
  lastBackupAt: number | null
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 10,
  desiredRetention: 0.9,
  autoplay: true,
  levels: ['a1', 'a2', 'b1', 'b2', 'c1'],
  lastBackupAt: null,
}

export async function loadSettings(): Promise<Settings> {
  const rows = await db.settings.toArray()
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return { ...DEFAULT_SETTINGS, ...stored } as Settings
}

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db.settings.put({ key, value })
}

// ---------- backup ----------

const DATE_KEYS = new Set(['dueAt', 'lastReviewAt', 'reviewTime'])

export async function exportBackup(): Promise<Blob> {
  const data = {
    app: 'improve',
    version: 1,
    exportedAt: new Date().toISOString(),
    progress: await db.progress.toArray(),
    reviews: await db.reviews.toArray(),
    settings: await db.settings.toArray(),
  }
  return new Blob([JSON.stringify(data)], { type: 'application/json' })
}

/** Replaces all local data with the backup. Throws if the file is not an Improve backup. */
export async function importBackup(text: string) {
  const data = JSON.parse(text, (key, value) =>
    DATE_KEYS.has(key) && typeof value === 'string' ? new Date(value) : value,
  )
  if (data?.app !== 'improve' || !Array.isArray(data.progress)) {
    throw new Error('Bu fayl Improve backup-ı deyil.')
  }
  await db.transaction('rw', db.progress, db.reviews, db.settings, async () => {
    await Promise.all([db.progress.clear(), db.reviews.clear(), db.settings.clear()])
    await db.progress.bulkAdd(data.progress)
    await db.reviews.bulkAdd(data.reviews ?? [])
    await db.settings.bulkAdd(data.settings ?? [])
  })
}

export async function resetProgress() {
  await db.transaction('rw', db.progress, db.reviews, async () => {
    await Promise.all([db.progress.clear(), db.reviews.clear()])
  })
}
