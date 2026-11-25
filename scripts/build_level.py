"""Build one CEFR level of the word base.

Input:  data/content/<level>.json   (hand-written meanings + examples)
        data/sources/*.csv          (CEFR-J / Octanove level lists)
        data/sources/cmudict.dict   (American pronunciations)
Output: public/words/<level>.json   (what the app loads)
        public/audio/<id>.mp3, <id>-ex.mp3
        build/<level>-report.txt    (things a human should check)

Usage:  .venv/bin/python scripts/build_level.py a2 [--no-audio] [--voice af_heart]

Optional fields in content/<level>.json:
  "ipa": "/.../"                     override the headword IPA
  "example_ipa": "/.../"             override the whole sentence IPA
  "ipa_words": {"read": "rɛd"}       override single words inside the sentence
"""

import argparse
import csv
import json
import re
import subprocess
from pathlib import Path

from ipa_us import CmuIpa

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "data" / "sources"
VOICES = ROOT / "data" / "voices"
OUT_WORDS = ROOT / "public" / "words"
OUT_AUDIO = ROOT / "public" / "audio"
MANIFEST = ROOT / "data" / "audio-manifest.json"  # file -> what it was generated from

LEVEL_FILES = {
    "cefrj-vocabulary-profile-1.5.csv": "CEFR-J 1.5",
    "octanove-vocabulary-profile-c1c2-1.0.csv": "Octanove C1/C2 1.0",
}
# Words whose pronunciation depends on meaning/grammar (read /rid/ vs /rɛd/).
# CMUdict cannot tell which one a sentence needs, so these are listed for review.
HETERONYMS = set("""read reread lead leads live lives record records present presents close closes
use used uses excuse wind winds tear tears minute object objects content desert deserts produce
permit permits refuse wound bow bows row rows dove project projects progress conduct contract
contracts subject subjects increase increases decrease export exports import imports estimate
estimates graduate graduates separate moderate appropriate alternate associate associates advocate
house houses upset perfect rebel conflict conflicts suspect suspects insult insults address survey
update upgrade attribute polish august resume learned aged blessed sow bass console compact
complex entrance intimate invalid recall abuse abuses advice advise does""".split())


def load_levels():
    """(headword, pos) -> (CEFR level, source). Handles 'realize/realise'."""
    index, from_lowercase = {}, set()
    for fname, source in LEVEL_FILES.items():
        with open(SOURCES / fname, encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                for variant in row["headword"].split("/"):
                    variant = variant.strip()
                    key = (variant.lower(), row["pos"])
                    # 'march' (B1, walk) must win over 'March' (A1, month): lowercase headwords take precedence.
                    if key not in index or (variant.islower() and key not in from_lowercase):
                        index[key] = (row["CEFR"], source)
                        if variant.islower():
                            from_lowercase.add(key)
    return index


def make_id(word, pos):
    return re.sub(r"[^a-z0-9]+", "-", word.lower()).strip("-") + "." + pos


def headword_ipa(cmu, word):
    """Citation form: of CMUdict's variants take the fullest (least reduced) one."""
    parts, alternatives = [], []
    for token in word.split():
        variants = cmu.variants(token)
        if not variants:
            return None, []
        best = max(variants, key=lambda v: len(v.replace("ˈ", "").replace("ˌ", "")))  # first on ties
        parts.append(best)
        alternatives += [v for v in variants if v != best]
    return "/" + " ".join(parts) + "/", alternatives


def ambiguous_tokens(cmu, sentence, overrides):
    """Heteronyms in the sentence that have no override yet."""
    found = []
    for token in re.findall(r"[A-Za-z’']+", sentence):
        key = token.lower().replace("’", "'")
        if key in HETERONYMS and key not in overrides and len(cmu.variants(key)) > 1:
            found.append(f"{token}: using {cmu.variants(key)[0]}, also {' | '.join(cmu.variants(key)[1:])}")
    return found


class Speaker:
    """Kokoro TTS -> mp3, regenerating only when text or voice changed."""

    def __init__(self, voice):
        from kokoro_onnx import Kokoro
        self.kokoro = Kokoro(str(VOICES / "kokoro-v1.0.onnx"), str(VOICES / "voices-v1.0.bin"))
        self.voice = voice
        self.manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
        OUT_AUDIO.mkdir(parents=True, exist_ok=True)

    def say(self, text, name):
        mp3 = OUT_AUDIO / f"{name}.mp3"
        key = f"kokoro:{self.voice}:{text}"
        if mp3.exists() and self.manifest.get(mp3.name) == key:
            return
        samples, rate = self.kokoro.create(text, voice=self.voice, speed=1.0, lang="en-us")
        pcm = (samples.clip(-1, 1) * 32767).astype("<i2").tobytes()
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "s16le", "-ar", str(rate), "-ac", "1",
                        "-i", "-", "-af", "adelay=150,apad=pad_dur=0.15",
                        "-codec:a", "libmp3lame", "-q:a", "5", str(mp3)], input=pcm, check=True)
        self.manifest[mp3.name] = key

    def save(self):
        MANIFEST.write_text(json.dumps(self.manifest, indent=0, sort_keys=True))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("level", help="e.g. a2")
    ap.add_argument("--no-audio", action="store_true")
    ap.add_argument("--voice", default="af_heart", help="Kokoro voice (af_heart, am_michael, ...)")
    args = ap.parse_args()
    level = args.level.lower()

    content = json.loads((ROOT / "data" / "content" / f"{level}.json").read_text(encoding="utf-8"))
    levels = load_levels()
    cmu = CmuIpa()
    speaker = None if args.no_audio else Speaker(args.voice)

    words, errors, review, seen = [], [], [], set()
    for i, item in enumerate(content, 1):
        word, pos = item["word"], item["pos"]
        wid = make_id(word, pos)
        if wid in seen:
            errors.append(f"duplicate: {wid}")
            continue
        seen.add(wid)

        cefr, _ = levels.get((word.lower(), pos), (None, None))
        if cefr is None:
            errors.append(f"not in CEFR lists: {word} ({pos})")
        elif cefr.lower() != level:
            errors.append(f"level mismatch: {word} ({pos}) is {cefr}, file is {level.upper()}")

        ipa = item.get("ipa")
        if not ipa:
            ipa, alternatives = headword_ipa(cmu, word)
            if ipa is None:
                errors.append(f"no IPA for headword '{word}': add \"ipa\" to the content file")
            elif alternatives and word.lower() in HETERONYMS:
                review.append(f"{word} ({pos}): using {ipa}, CMUdict also has {', '.join(alternatives)}")

        overrides = dict(item.get("ipa_words", {}))
        if ipa and " " not in word:
            overrides.setdefault(word.lower(), ipa.strip("/"))  # same IPA as the card's headword
        example_ipa = item.get("example_ipa")
        if not example_ipa:
            example_ipa, problems = cmu.sentence(item["example"], overrides)
            errors += [f"{word}: {p} (add it to \"ipa_words\")" for p in problems]
            review += [f"{word} — \"{item['example']}\" — {a}" for a in ambiguous_tokens(cmu, item["example"], overrides)]

        entry = {
            "id": wid, "word": word, "pos": pos, "level": (cefr or level).upper(),
            "ipa": ipa, "az": item["az"],
            "example": item["example"], "example_ipa": example_ipa, "example_az": item["example_az"],
        }
        for optional in ("note", "syllabus"):
            if optional in item:
                entry[optional] = item[optional]

        if speaker:
            speaker.say(word, wid)
            speaker.say(item["example"], f"{wid}-ex")
            entry["audio"] = f"audio/{wid}.mp3"
            entry["audio_example"] = f"audio/{wid}-ex.mp3"

        words.append(entry)
        print(f"[{i}/{len(content)}] {word:15} {ipa or '-'}")

    if speaker:
        speaker.save()
    OUT_WORDS.mkdir(parents=True, exist_ok=True)
    out = OUT_WORDS / f"{level}.json"
    out.write_text(json.dumps(words, ensure_ascii=False, indent=1), encoding="utf-8")

    report = ROOT / "build" / f"{level}-report.txt"
    report.parent.mkdir(exist_ok=True)
    report.write_text("ERRORS (must fix)\n" + "\n".join(errors or ["none"]) +
                      "\n\nREVIEW (several pronunciations; check the chosen one is right here)\n" +
                      "\n".join(review or ["none"]) + "\n", encoding="utf-8")
    print(f"\nWrote {len(words)} words -> {out.relative_to(ROOT)}")
    print(f"{len(errors)} errors, {len(review)} items to review -> {report.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
