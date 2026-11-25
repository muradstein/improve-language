import { useCallback, useEffect, useRef, useState } from 'react'
import { play } from '../audio'
import type { Settings } from '../db'
import { answer, nextItem, previewIntervals, type Grade, type StudyItem } from '../srs'
import { POS_AZ, type WordBase } from '../words'

const BUTTONS: { grade: Grade; label: string; className: string }[] = [
  { grade: 1, label: 'Again', className: 'again' },
  { grade: 2, label: 'Hard', className: 'hard' },
  { grade: 3, label: 'Good', className: 'good' },
  { grade: 4, label: 'Easy', className: 'easy' },
]

export default function Study({ words, settings, onDone }: { words: WordBase; settings: Settings; onDone: () => void }) {
  const [item, setItem] = useState<StudyItem | null | undefined>(undefined) // undefined = loading
  const [revealed, setRevealed] = useState(false)
  const [intervals, setIntervals] = useState<Record<Grade, string> | null>(null)
  const [done, setDone] = useState(0)
  const shownAt = useRef(Date.now())
  const busy = useRef(false)

  const loadNext = useCallback(async () => {
    const next = await nextItem(words, settings)
    setRevealed(false)
    setItem(next)
    shownAt.current = Date.now()
    if (next) {
      setIntervals(await previewIntervals(next, settings))
      if (settings.autoplay) play(next.word.audio)
    }
  }, [words, settings])

  useEffect(() => {
    loadNext()
  }, [loadNext])

  const reveal = useCallback(() => {
    if (!item || revealed) return
    setRevealed(true)
    if (settings.autoplay) play(item.word.audio_example)
  }, [item, revealed, settings.autoplay])

  const rate = useCallback(
    async (grade: Grade) => {
      if (!item || !revealed || busy.current) return
      busy.current = true
      try {
        await answer(item, grade, settings, Date.now() - shownAt.current)
        setDone((n) => n + 1)
        await loadNext()
      } finally {
        busy.current = false
      }
    },
    [item, revealed, settings, loadNext],
  )

  // Keyboard (computer): space/enter shows the answer, 1-4 rate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        reveal()
      } else if (['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as Grade)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reveal, rate])

  if (item === undefined) return null
  if (item === null) {
    return (
      <div className="stack center-col">
        <div className="done-emoji">🎉</div>
        <h2>Bu günlük bitdi!</h2>
        <p className="muted">{done > 0 ? `${done} kart təkrarlandı.` : 'Hazırda təkrarlanacaq kart yoxdur.'} Sabah yenə gəl.</p>
        <button className="primary" onClick={onDone}>
          Ana səhifə
        </button>
      </div>
    )
  }

  const w = item.word
  return (
    <div className="study">
      <div className="study-top muted small">
        <span>{item.progress ? 'Təkrar' : 'Yeni söz'}</span>
        <span>{done} edilib</span>
      </div>

      <article className="card flashcard" onClick={reveal}>
        <div className="word-row">
          <h1 className="word">{w.word}</h1>
          <SpeakButton src={w.audio} label="Sözü dinlə" />
        </div>
        <div className="ipa">{w.ipa}</div>
        <div className="meta muted small">
          {w.level} · {POS_AZ[w.pos] ?? w.pos}
          {w.syllabus && ' · 📘 syllabus'}
        </div>

        <div className="example-row">
          <p className="example">{w.example}</p>
          <SpeakButton src={w.audio_example} label="Cümləni dinlə" />
        </div>

        {revealed ? (
          <div className="answer">
            <div className="az">{w.az}</div>
            <div className="ipa small">{w.example_ipa}</div>
            <p className="example-az">{w.example_az}</p>
            {w.note && <div className="note">💡 {w.note}</div>}
          </div>
        ) : (
          <div className="tap-hint muted small">Cavabı görmək üçün toxun</div>
        )}
      </article>

      <div className="answer-bar">
        {revealed ? (
          BUTTONS.map((b) => (
            <button key={b.grade} className={`grade ${b.className}`} onClick={() => rate(b.grade)}>
              <span>{b.label}</span>
              <span className="small">{intervals?.[b.grade] ?? ''}</span>
            </button>
          ))
        ) : (
          <button className="primary wide" onClick={reveal}>
            Cavabı göstər
          </button>
        )}
      </div>
    </div>
  )
}

export function SpeakButton({ src, label }: { src?: string; label: string }) {
  if (!src) return null
  return (
    <button
      className="speak"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation() // don't flip the card
        play(src)
      }}
    >
      🔊
    </button>
  )
}
