import { useCallback, useEffect, useState } from 'react'
import { unlockAudio } from './audio'
import { loadSettings, type Settings } from './db'
import { loadWords, type WordBase } from './words'
import Home from './screens/Home'
import Study from './screens/Study'
import WordList from './screens/WordList'
import SettingsScreen from './screens/Settings'

export type Tab = 'home' | 'study' | 'words' | 'settings'

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'home', icon: '🏠', label: 'Ana səhifə' },
  { id: 'study', icon: '📚', label: 'Öyrən' },
  { id: 'words', icon: '🔎', label: 'Sözlər' },
  { id: 'settings', icon: '⚙️', label: 'Ayarlar' },
]

export default function App() {
  const [words, setWords] = useState<WordBase | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('home')

  useEffect(() => {
    Promise.all([loadWords(), loadSettings()])
      .then(([w, s]) => {
        setWords(w)
        setSettings(s)
      })
      .catch((e) => setError(String(e)))
  }, [])

  const reloadSettings = useCallback(() => loadSettings().then(setSettings), [])

  if (error) return <div className="center">Xəta: {error}</div>
  if (!words || !settings) return <div className="center muted">Yüklənir…</div>

  return (
    <div className="app" onPointerDown={unlockAudio}>
      <main className="content">
        {tab === 'home' && <Home words={words} settings={settings} onStart={() => setTab('study')} />}
        {tab === 'study' && <Study words={words} settings={settings} onDone={() => setTab('home')} />}
        {tab === 'words' && <WordList words={words} />}
        {tab === 'settings' && <SettingsScreen words={words} settings={settings} onChange={reloadSettings} />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
