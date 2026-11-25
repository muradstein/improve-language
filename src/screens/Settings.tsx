import { useRef, useState } from 'react'
import { exportBackup, importBackup, resetProgress, saveSetting, type Settings } from '../db'
import { LEVELS, type WordBase } from '../words'

export default function SettingsScreen({
  words,
  settings,
  onChange,
}: {
  words: WordBase
  settings: Settings
  onChange: () => void
}) {
  const [message, setMessage] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const set = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    await saveSetting(key, value)
    onChange()
  }

  const doExport = async () => {
    const blob = await exportBackup()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `improve-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    await set('lastBackupAt', Date.now())
    setMessage('Backup faylı yaradıldı. Onu iCloud Drive / Files-da saxla.')
  }

  const doImport = async (file: File) => {
    try {
      await importBackup(await file.text())
      onChange()
      setMessage('Backup bərpa olundu ✓')
    } catch (e) {
      setMessage(`Bərpa alınmadı: ${e instanceof Error ? e.message : e}`)
    }
  }

  const available = LEVELS.filter((l) => words.byLevel[l]?.length)

  return (
    <div className="stack">
      <h1>Ayarlar</h1>

      <section className="card form">
        <label className="row">
          <span>
            Gündə yeni söz
            <div className="muted small">Planında: 10–15</div>
          </span>
          <input
            type="number"
            min={0}
            max={100}
            value={settings.newPerDay}
            onChange={(e) => set('newPerDay', Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          />
        </label>

        <label className="row">
          <span>
            Yadda saxlama hədəfi
            <div className="muted small">Yüksək = daha çox təkrar, daha az unutma</div>
          </span>
          <select value={settings.desiredRetention} onChange={(e) => set('desiredRetention', Number(e.target.value))}>
            <option value={0.85}>85%</option>
            <option value={0.9}>90% (tövsiyə)</option>
            <option value={0.95}>95%</option>
          </select>
        </label>

        <label className="row">
          <span>Avtomatik səsləndirmə</span>
          <input type="checkbox" checked={settings.autoplay} onChange={(e) => set('autoplay', e.target.checked)} />
        </label>
      </section>

      <section className="card form">
        <h2>Yeni sözlər hansı səviyyələrdən gəlsin</h2>
        {available.map((l) => (
          <label key={l} className="row">
            <span>
              {l.toUpperCase()} <span className="muted small">({words.byLevel[l]!.length} söz)</span>
            </span>
            <input
              type="checkbox"
              checked={settings.levels.includes(l)}
              onChange={(e) =>
                set('levels', e.target.checked ? LEVELS.filter((x) => x === l || settings.levels.includes(x)) : settings.levels.filter((x) => x !== l))
              }
            />
          </label>
        ))}
        <p className="muted small">Hazırda yalnız {available.map((l) => l.toUpperCase()).join(', ')} bazası hazırdır.</p>
      </section>

      <section className="card form">
        <h2>Backup</h2>
        <p className="muted small">
          Proqresin yalnız bu cihazda saxlanılır. Telefonu itirsən və ya Safari datasını silsən, itəcək. Ayda bir dəfə backup et.
        </p>
        <button className="primary" onClick={doExport}>
          💾 Backup faylı yarat
        </button>
        <button onClick={() => fileInput.current?.click()}>📂 Backup-dan bərpa et</button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
        />
        {settings.lastBackupAt && (
          <p className="muted small">Son backup: {new Date(settings.lastBackupAt).toLocaleDateString('az')}</p>
        )}
      </section>

      <section className="card form">
        <h2>Təhlükəli zona</h2>
        {confirmReset ? (
          <div className="row">
            <span>Bütün proqres silinsin?</span>
            <span className="row-buttons">
              <button onClick={() => setConfirmReset(false)}>Xeyr</button>
              <button
                className="danger"
                onClick={async () => {
                  await resetProgress()
                  setConfirmReset(false)
                  onChange()
                  setMessage('Proqres sıfırlandı.')
                }}
              >
                Bəli, sil
              </button>
            </span>
          </div>
        ) : (
          <button className="danger" onClick={() => setConfirmReset(true)}>
            Proqresi sıfırla
          </button>
        )}
      </section>

      {message && <div className="card notice">{message}</div>}

      <p className="muted small center">
        Səviyyələr: CEFR-J, Octanove · Tələffüz: CMU Pronouncing Dictionary · Səs: Kokoro TTS
      </p>
    </div>
  )
}
