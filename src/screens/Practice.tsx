import { useEffect, useRef, useState } from 'react'
import { play } from '../audio'
import {
  buildSession,
  diffWords,
  isCorrect,
  MIN_POOL,
  MODES,
  normalize,
  practicePool,
  recordPractice,
  type DiffToken,
  type Exercise,
  type Mode,
} from '../practice'
import { POS_AZ, type Word, type WordBase } from '../words'
import { SpeakButton } from './Study'

type Choice = Mode | 'mixed'

export default function Practice({ words }: { words: WordBase }) {
  const [pool, setPool] = useState<Word[] | null>(null)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [session, setSession] = useState<Exercise[]>([])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)

  useEffect(() => {
    practicePool(words).then(setPool)
  }, [words])

  const start = (c: Choice) => {
    if (!pool) return
    setChoice(c)
    setSession(buildSession(pool, c))
    setIndex(0)
    setScore(0)
  }

  if (!pool) return null

  if (pool.length < MIN_POOL) {
    return (
      <div className="stack center-col">
        <div className="done-emoji">✍️</div>
        <h2>Məşq</h2>
        <p className="muted">
          Məşq tapşırıqları öyrəndiyin sözlərdən qurulur. Əvvəlcə <b>Öyrən</b> bölməsində ən azı {MIN_POOL} söz öyrən.
        </p>
      </div>
    )
  }

  if (!choice) {
    return (
      <div className="stack">
        <h1>Məşq</h1>
        <p className="muted small">
          Öyrəndiyin {pool.length} söz və ifadə əsasında cümlə qurmaq. Zəif bildiyin sözlər daha tez-tez gəlir.
        </p>
        <button className="card mode-card primary-card" onClick={() => start('mixed')}>
          <span className="mode-icon">🎯</span>
          <span>
            <b>Qarışıq məşq</b>
            <span className="muted small block">{SESSION_LENGTH_LABEL} — bütün növlər növbə ilə</span>
          </span>
        </button>
        {MODES.map((m) => (
          <button key={m.id} className="card mode-card" onClick={() => start(m.id)}>
            <span className="mode-icon">{m.icon}</span>
            <span>
              <b>{m.label}</b>
              <span className="muted small block">{m.hint}</span>
            </span>
          </button>
        ))}
      </div>
    )
  }

  if (index >= session.length) {
    return (
      <div className="stack center-col">
        <div className="done-emoji">{score >= session.length * 0.8 ? '🎉' : '💪'}</div>
        <h2>
          {score} / {session.length}
        </h2>
        <p className="muted">{score >= session.length * 0.8 ? 'Əla nəticə!' : 'Səhv etdiklərin sonrakı məşqlərdə yenə gələcək.'}</p>
        <button className="primary" onClick={() => start(choice)}>
          Yenidən
        </button>
        <button onClick={() => setChoice(null)}>Başqa məşq növü</button>
      </div>
    )
  }

  const ex = session[index]
  return (
    <div className="study">
      <div className="study-top muted small">
        <button className="link" onClick={() => setChoice(null)}>
          ← Məşqlər
        </button>
        <span>
          {index + 1} / {session.length} · ✅ {score}
        </span>
      </div>
      <ExerciseView
        key={`${index}-${ex.item.id}`}
        ex={ex}
        onDone={(correct) => {
          recordPractice(ex.mode, ex.item.id, correct)
          if (correct) setScore((s) => s + 1)
          setIndex((i) => i + 1)
        }}
      />
    </div>
  )
}

const SESSION_LENGTH_LABEL = '10 tapşırıq'

function ExerciseView({ ex, onDone }: { ex: Exercise; onDone: (correct: boolean) => void }) {
  const [result, setResult] = useState<boolean | null>(null)
  const [diff, setDiff] = useState<DiffToken[] | null>(null)
  const mode = MODES.find((m) => m.id === ex.mode)!

  const finish = (correct: boolean, answer?: string) => {
    setResult(correct)
    if (answer !== undefined && !correct) setDiff(diffWords(answer, ex.item.example))
    play(ex.item.audio_example)
  }

  return (
    <>
      <article className="card flashcard practice-card">
        <div className="muted small">
          {mode.icon} {mode.label}
        </div>
        {ex.mode === 'build' && <BuildTask ex={ex} done={result !== null} onCheck={finish} />}
        {ex.mode === 'cloze' && <ClozeTask ex={ex} done={result !== null} onCheck={finish} />}
        {ex.mode === 'dictation' && <TypeTask ex={ex} done={result !== null} onCheck={finish} listen />}
        {ex.mode === 'translate' && <TypeTask ex={ex} done={result !== null} onCheck={finish} />}

        {result !== null && <Feedback item={ex.item} correct={result} diff={diff} />}
      </article>

      <div className="answer-bar">
        {result === null ? null : result || ex.mode !== 'translate' ? (
          <button className="primary wide" onClick={() => onDone(result)}>
            Növbəti →
          </button>
        ) : (
          // Translation has many valid answers: let the learner judge after seeing the model answer.
          <>
            <button className="grade again" onClick={() => onDone(false)}>
              Səhv idi
            </button>
            <button className="grade good" onClick={() => onDone(true)}>
              Mənimki də düzdür
            </button>
          </>
        )}
      </div>
    </>
  )
}

/** 🧩 Tap the shuffled words in the right order. */
function BuildTask({ ex, done, onCheck }: { ex: Exercise; done: boolean; onCheck: (ok: boolean, answer?: string) => void }) {
  // Tiles are tracked by index so repeated words ("the ... the") work.
  const [picked, setPicked] = useState<number[]>([])
  const tiles = ex.tiles!
  const answer = picked.map((i) => tiles[i]).join(' ')

  return (
    <>
      <p className="prompt">{ex.item.example_az}</p>
      <div className={`build-answer ${done ? 'locked' : ''}`}>
        {picked.length === 0 && <span className="muted small">Sözlərə toxunaraq cümləni qur</span>}
        {picked.map((i, pos) => (
          <button key={pos} className="tile picked" disabled={done} onClick={() => setPicked(picked.filter((_, p) => p !== pos))}>
            {tiles[i]}
          </button>
        ))}
      </div>
      <div className="tile-bank">
        {tiles.map((t, i) => (
          <button key={i} className="tile" disabled={done || picked.includes(i)} onClick={() => setPicked([...picked, i])}>
            {t}
          </button>
        ))}
      </div>
      {!done && (
        <button className="primary wide" disabled={picked.length !== tiles.length} onClick={() => onCheck(answer === ex.tokens.join(' '), answer)}>
          Yoxla
        </button>
      )}
    </>
  )
}

/** ✏️ Type the missing word (shown in its sentence form, e.g. "decided"). */
function ClozeTask({ ex, done, onCheck }: { ex: Exercise; done: boolean; onCheck: (ok: boolean) => void }) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const target = ex.tokens[ex.blank!]
  const targetWord = normalize(target)
  useEffect(() => input.current?.focus(), [])

  const check = () => onCheck(normalize(value) === targetWord)

  return (
    <>
      <p className="prompt sentence">
        {ex.tokens.map((t, i) =>
          i === ex.blank ? (
            <span key={i} className={`blank ${done ? 'filled' : ''}`}>
              {done ? t : '_'.repeat(Math.max(4, targetWord.length))}
            </span>
          ) : (
            <span key={i}>{t} </span>
          ),
        )}
      </p>
      <p className="muted small">
        {ex.item.example_az}
        <br />
        İpucu: {ex.item.az} · <b>{targetWord[0]}</b>
        {'…'} ({targetWord.length} hərf)
      </p>
      {!done && (
        <form
          className="type-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim()) check()
          }}
        >
          <input ref={input} className="search" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Sözü yaz…" />
          <button className="primary" type="submit" disabled={!value.trim()}>
            Yoxla
          </button>
        </form>
      )}
    </>
  )
}

/** 🎧 Dictation (listen) or 🔁 translation (read Azerbaijani): type the whole sentence. */
function TypeTask({ ex, done, onCheck, listen }: { ex: Exercise; done: boolean; onCheck: (ok: boolean, answer: string) => void; listen?: boolean }) {
  const [value, setValue] = useState('')
  useEffect(() => {
    if (listen) play(ex.item.audio_example)
  }, [listen, ex.item.audio_example])

  return (
    <>
      {listen ? (
        <div className="listen-row">
          <button className="speak big" onClick={() => play(ex.item.audio_example)} aria-label="Yenidən dinlə">
            🔊
          </button>
          <span className="muted small">Cümləni dinlə və yaz. Lazım olsa, yenidən dinlə.</span>
        </div>
      ) : (
        <>
          <p className="prompt">{ex.item.example_az}</p>
          <p className="muted small">
            Bu cümlədə işlət: <b>{ex.item.word}</b> — {ex.item.az}
          </p>
        </>
      )}
      {!done && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim()) onCheck(isCorrect(value, ex.item.example), value)
          }}
        >
          <textarea className="search answer-input" rows={3} autoCapitalize="sentences" autoCorrect="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} placeholder="İngiliscə yaz…" />
          <button className="primary wide" type="submit" disabled={!value.trim()}>
            Yoxla
          </button>
        </form>
      )}
    </>
  )
}

function Feedback({ item, correct, diff }: { item: Word; correct: boolean; diff: DiffToken[] | null }) {
  return (
    <div className={`answer feedback ${correct ? 'ok' : 'bad'}`}>
      <div className="feedback-title">{correct ? '✅ Düzdür!' : '❌ Düzgün cavab:'}</div>
      {diff && (
        <p className="diff">
          {diff.map((d, i) => (
            <span key={i} className={`d-${d.status}`}>
              {d.text}{' '}
            </span>
          ))}
        </p>
      )}
      <div className="example-row">
        <p className="example">{item.example}</p>
        <SpeakButton src={item.audio_example} label="Cümləni dinlə" />
      </div>
      <div className="ipa small">{item.example_ipa}</div>
      <p className="example-az">{item.example_az}</p>
      <div className="muted small">
        <b>{item.word}</b> {item.ipa} · {POS_AZ[item.pos] ?? item.pos} — {item.az}
      </div>
      {diff && (
        <p className="muted small">
          <span className="d-missing">yaşıl</span> — yazmadığın, <span className="d-extra">qırmızı</span> — artıq və ya səhv yazdığın sözlər.
        </p>
      )}
    </div>
  )
}
