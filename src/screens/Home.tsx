import { useEffect, useState } from 'react'
import type { Settings } from '../db'
import { levelStats, streak, todayCounts, type LevelStats, type TodayCounts } from '../srs'
import type { WordBase } from '../words'

const BACKUP_REMINDER_DAYS = 30

export default function Home({ words, settings, onStart }: { words: WordBase; settings: Settings; onStart: () => void }) {
  const [counts, setCounts] = useState<TodayCounts | null>(null)
  const [levels, setLevels] = useState<LevelStats[]>([])
  const [days, setDays] = useState(0)

  useEffect(() => {
    todayCounts(words, settings).then(setCounts)
    levelStats(words).then(setLevels)
    streak().then(setDays)
  }, [words, settings])

  if (!counts) return null
  const nothingLeft = counts.due === 0 && counts.newLeft === 0
  const totalSeen = levels.reduce((n, l) => n + l.seen, 0)
  const backupDue =
    totalSeen > 0 &&
    (settings.lastBackupAt === null || Date.now() - settings.lastBackupAt > BACKUP_REMINDER_DAYS * 86400_000)

  return (
    <div className="stack">
      <header className="home-header">
        <h1>Improve English</h1>
        <div className="streak" title="Ardıcıl günlər">🔥 {days} gün</div>
      </header>

      <section className="card today">
        <div className="today-counts">
          <div>
            <div className="big">{counts.due}</div>
            <div className="muted">təkrar</div>
          </div>
          <div>
            <div className="big">{counts.newLeft}</div>
            <div className="muted">yeni söz</div>
          </div>
          <div>
            <div className="big">{counts.reviewedToday}</div>
            <div className="muted">bu gün edilib</div>
          </div>
        </div>
        <button className="primary wide" onClick={onStart} disabled={nothingLeft}>
          {nothingLeft ? 'Bu günlük hamısı bitdi ✓' : 'Başla'}
        </button>
      </section>

      {backupDue && (
        <section className="card notice">
          💾 Proqresin yalnız bu cihazda saxlanılır. <b>Ayarlar → Backup</b> ilə ehtiyat nüsxə çıxar.
        </section>
      )}

      <section className="card">
        <h2>Səviyyələr</h2>
        {levels.map((l) => (
          <div key={l.level} className="level-row">
            <div className="level-head">
              <b>{l.level.toUpperCase()}</b>
              <span className="muted">
                {l.learned} öyrənilib · {l.seen} görülüb · {l.total} söz
              </span>
            </div>
            <div className="bar">
              <div className="bar-seen" style={{ width: `${(100 * l.seen) / Math.max(1, l.total)}%` }} />
              <div className="bar-learned" style={{ width: `${(100 * l.learned) / Math.max(1, l.total)}%` }} />
            </div>
          </div>
        ))}
        <p className="muted small">"Öyrənilib" — FSRS-ə görə ən azı 3 həftə yadda qalacaq söz.</p>
      </section>
    </div>
  )
}
