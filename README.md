# Improve — İngilis dili söz bazası və öyrənmə app-i (A1 → C1)

Şəxsi ingilis dili planım üçün söz bazası və spaced repetition (FSRS) əsaslı PWA.

## Qovluq strukturu

```
data/
  content/<level>.json   ← əl ilə yazılmış: AZ məna, nümunə cümlə, qeyd (əsas iş buradadır)
  sources/               ← CEFR-J və Octanove səviyyə siyahıları (endirilmiş)
  voices/                ← Piper TTS səsi (git-ə düşmür, aşağıya bax)
  cache/                 ← Wiktionary cavabları (git-ə düşmür)
scripts/
  build_level.py         ← content + IPA + səs → public/words/<level>.json
  make_anki.py           ← public/words → build/english-<level>.apkg (Anki üçün)
public/                  ← app-in yükləyəcəyi fayllar
  words/<level>.json
  audio/<id>.mp3, <id>-ex.mp3
build/                   ← Anki deck-ləri (git-ə düşmür)
```

## Quraşdırma

```bash
python3 -m venv .venv
.venv/bin/pip install kokoro-onnx genanki
# Kokoro səs modeli (Apache 2.0, ~350 MB):
B=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
curl -L -o data/voices/kokoro-v1.0.onnx $B/kokoro-v1.0.onnx
curl -L -o data/voices/voices-v1.0.bin  $B/voices-v1.0.bin
```

Sistemdə `ffmpeg` olmalıdır.

## İstifadə

```bash
.venv/bin/python scripts/build_level.py a2     # söz bazası + səslər
.venv/bin/python scripts/make_anki.py a2       # build/english-a2.apkg
```

`build_level.py` hər sözü CEFR-J/Octanove siyahısı ilə yoxlayır və səviyyə uyğunsuzluqlarını, tapılmayan sözləri, IPA-sı olmayanları "Problems" altında göstərir. Səs faylı artıq varsa, yenidən yaradılmır.

Wiktionary-dən gələn IPA səhvdirsə, `data/content/<level>.json`-da həmin sözə `"ipa": "/.../"` əlavə et.

Anki deck-i yenidən import etsən, kartlar dublikat olmur, yenilənir (sabit GUID).

## Mənbələr və lisenziyalar

- **CEFR-J Wordlist Version 1.5.** Compiled by Yukio Tono, Tokyo University of Foreign Studies. http://www.cefr-j.org/download.html (via [Open Language Profiles](https://github.com/openlanguageprofiles/olp-en-cefrj)). Tədqiqat və kommersiya məqsədləri üçün pulsuzdur, istinad şərti ilə.
- **Octanove Vocabulary Profile C1/C2 1.0**, Octanove Labs. CC BY-SA 4.0.
- **IPA (Amerika tələffüzü):** [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict), BSD-style lisenziya.
- **Səs:** [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache 2.0) via [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx), səs `af_heart`. Model faylları: `kokoro-v1.0.onnx`, `voices-v1.0.bin` → `data/voices/` (git-ə düşmür).
- **AZ mənalar və nümunə cümlələr:** bu layihə üçün yazılıb.

## App (PWA)

```bash
npm install
npm run dev       # http://localhost:5173, also on the local network (--host)
npm run build     # dist/ — this is what goes to GitHub Pages
npm run preview   # serves dist/ on http://localhost:4173
```

- `src/srs.ts` — FSRS (ts-fsrs, FSRS-7) scheduling: due cards → new words → learning cards due within 20 minutes.
- `src/db.ts` — IndexedDB (Dexie): `progress`, `reviews`, `settings`; backup export/import.
- The study day starts at 04:00, like Anki.
- Tələffüz: `scripts/ipa_us.py` CMUdict → American IPA (learner-dictionary style). Səs: Kokoro `af_heart`.
