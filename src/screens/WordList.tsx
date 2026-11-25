import { useEffect, useMemo, useState } from 'react'
import { db, type Progress } from '../db'
import { formatInterval, MATURE_STABILITY_DAYS } from '../srs'
import { isPhrase, POS_AZ, type Word, type WordBase } from '../words'
import { SpeakButton } from './Study'

const MAX_SHOWN = 200

function status(p: Progress | undefined): { label: string; className: string } {
  if (!p) return { label: 'yeni', className: 'st-new' }
  if (p.card.stability >= MATURE_STABILITY_DAYS) return { label: 'öyrənilib', className: 'st-learned' }
  return { label: 'öyrənilir', className: 'st-learning' }
}

export default function WordList({ words }: { words: WordBase }) {
  const [query, setQuery] = useState('')
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map())
  const [open, setOpen] = useState<string | null>(null)
  const [kind, setKind] = useState<'all' | 'words' | 'phrases'>('all')

  useEffect(() => {
    db.progress.toArray().then((all) => setProgress(new Map(all.map((p) => [p.wordId, p]))))
  }, [])

  const all = useMemo(() => [...words.byId.values()], [words])
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const ofKind = all.filter((w) => kind === 'all' || (kind === 'phrases') === isPhrase(w))
    if (!q) return ofKind
    return ofKind.filter((w) => w.word.toLowerCase().includes(q) || w.az.toLowerCase().includes(q))
  }, [all, query, kind])

  return (
    <div className="stack">
      <input
        className="search"
        type="search"
        placeholder="Axtar: ingiliscə və ya azərbaycanca…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="filter-row">
        {(
          [
            ['all', 'Hamısı'],
            ['words', 'Sözlər'],
            ['phrases', 'İfadələr'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="muted small">{matches.length} nəticə</div>
      <ul className="word-list">
        {matches.slice(0, MAX_SHOWN).map((w) => (
          <WordRow key={w.id} w={w} p={progress.get(w.id)} open={open === w.id} onToggle={() => setOpen(open === w.id ? null : w.id)} />
        ))}
      </ul>
      {matches.length > MAX_SHOWN && <div className="muted small center">Daha çox görmək üçün axtarışı dəqiqləşdir.</div>}
    </div>
  )
}

function WordRow({ w, p, open, onToggle }: { w: Word; p?: Progress; open: boolean; onToggle: () => void }) {
  const st = status(p)
  return (
    <li className={`word-item ${open ? 'open' : ''}`} onClick={onToggle}>
      <div className="word-item-head">
        <div>
          <b>{w.word}</b> <span className="ipa small">{w.ipa}</span>
          <div className="muted small">{w.az}</div>
        </div>
        <span className={`status ${st.className}`}>{st.label}</span>
      </div>
      {open && (
        <div className="word-item-body" onClick={(e) => e.stopPropagation()}>
          <div className="muted small">
            {w.level} · {POS_AZ[w.pos] ?? w.pos}
            {p && ` · növbəti təkrar: ${p.dueAt <= Date.now() ? 'indi' : formatInterval(p.dueAt - Date.now()) + ' sonra'}`}
          </div>
          <div className="example-row">
            <p className="example">{w.example}</p>
            <SpeakButton src={w.audio_example} label="Cümləni dinlə" />
          </div>
          <div className="ipa small">{w.example_ipa}</div>
          <p className="example-az">{w.example_az}</p>
          {w.usage && <div className="note usage">💬 {w.usage}</div>}
          {w.note && <div className="note">💡 {w.note}</div>}
          <SpeakButton src={w.audio} label="Sözü dinlə" />
        </div>
      )}
    </li>
  )
}
