"""Collocations and expressions ("Söz birləşmələri və ifadələr").

Input:  data/phrases/<level>.json — hand-written entries:
  {"phrase": "make a decision", "type": "collocation" | "expression",
   "az": "qərar vermək", "usage": "(expressions) when to use it, in Azerbaijani",
   "example": "...", "example_az": "...", "words": ["decision"],
   optional: "note", "syllabus", "ipa_words"}

Usage:
  .venv/bin/python scripts/phrases.py check data/phrases/staging-<x>.json <level>
  .venv/bin/python scripts/phrases.py build <level> [--no-audio]
Output (build): public/phrases/<level>.json (same shape as public/words/*.json, pos = type)
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_level import ROOT, Speaker, ambiguous_tokens, make_id  # noqa: E402
from ipa_us import CmuIpa  # noqa: E402

TYPES = ("collocation", "expression")
REQUIRED = ("phrase", "type", "az", "example", "example_az")
ALLOWED = set(REQUIRED) | {"usage", "words", "note", "syllabus", "ipa_words"}
PHRASES = ROOT / "data" / "phrases"
OUT = ROOT / "public" / "phrases"


def spoken(phrase):
    """Text for TTS/IPA: 'On the one hand... on the other hand...' -> 'On the one hand, on the other hand'."""
    text = re.sub(r"\s*(\.\.\.|…)\s*", ", ", phrase).strip(" ,")
    return re.sub(r"\s*/\s*", " or ", text)


def phrase_id(item):
    return make_id(item["phrase"].replace("...", " ").replace("…", " "), "phrase")


def all_headwords():
    words = set()
    for f in (ROOT / "data" / "content").glob("*.json"):
        for x in json.loads(f.read_text(encoding="utf-8")):
            words.add(x["word"].lower())
    return words


def check(path, level):
    items = json.loads(Path(path).read_text(encoding="utf-8"))
    cmu, headwords = CmuIpa(), all_headwords()
    existing = set()
    target = PHRASES / f"{level}.json"
    if target.exists():
        existing = {phrase_id(x) for x in json.loads(target.read_text(encoding="utf-8"))}
    errors, review, seen = [], [], set()
    for n, item in enumerate(items, 1):
        where = f"#{n} {item.get('phrase', '?')}"
        missing = [k for k in REQUIRED if not str(item.get(k, "")).strip()]
        if missing:
            errors.append(f"{where}: missing {missing}")
            continue
        if set(item) - ALLOWED:
            errors.append(f"{where}: unknown fields {sorted(set(item) - ALLOWED)}")
        if item["type"] not in TYPES:
            errors.append(f"{where}: type must be one of {TYPES}")
        if item["type"] == "expression" and not item.get("usage"):
            errors.append(f"{where}: expressions need \"usage\" (nə vaxt işlədilir)")
        pid = phrase_id(item)
        if pid in seen:
            errors.append(f"{where}: duplicate in batch")
        if pid in existing:
            errors.append(f"{where}: already in {target.name}")
        seen.add(pid)
        if re.search(r"\d", item["example"] + item["phrase"]):
            errors.append(f"{where}: digits — write numbers as words")
        unknown = [w for w in item.get("words", []) if w.lower() not in headwords]
        if unknown:
            review.append(f"{where}: words not in the word base: {unknown}")
        overrides = item.get("ipa_words", {})
        for label, text in (("phrase", spoken(item["phrase"])), ("example", item["example"])):
            _, problems = cmu.sentence(text, overrides)
            errors += [f"{where}: {label}: {p} — add to \"ipa_words\" or reword" for p in problems]
            review += [f"{where}: {label} \"{text}\" — {a} — if wrong here, add to \"ipa_words\""
                       for a in ambiguous_tokens(cmu, text, overrides)]
    print(f"{len(items)} entries, {len(errors)} errors, {len(review)} review items")
    for e in errors:
        print("ERROR ", e)
    for r in review:
        print("REVIEW", r)
    return 1 if errors else 0


def build(level, audio=True):
    items = json.loads((PHRASES / f"{level}.json").read_text(encoding="utf-8"))
    cmu = CmuIpa()
    speaker = Speaker("af_heart") if audio else None
    out = []
    for item in items:
        pid = phrase_id(item)
        overrides = item.get("ipa_words", {})
        entry = {
            "id": pid, "word": item["phrase"], "pos": item["type"], "level": level.upper(),
            "ipa": cmu.sentence(spoken(item["phrase"]), overrides)[0], "az": item["az"],
            "example": item["example"], "example_ipa": cmu.sentence(item["example"], overrides)[0],
            "example_az": item["example_az"],
        }
        for optional in ("usage", "note", "syllabus", "words"):
            if item.get(optional):
                entry[optional] = item[optional]
        if speaker:
            speaker.say(spoken(item["phrase"]), pid)
            speaker.say(item["example"], f"{pid}-ex")
            entry["audio"] = f"audio/{pid}.mp3"
            entry["audio_example"] = f"audio/{pid}-ex.mp3"
        out.append(entry)
    if speaker:
        speaker.save()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{level}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {len(out)} phrases -> public/phrases/{level}.json")


def merge(path, level):
    PHRASES.mkdir(parents=True, exist_ok=True)
    target = PHRASES / f"{level}.json"
    base = json.loads(target.read_text(encoding="utf-8")) if target.exists() else []
    have = {phrase_id(x) for x in base}
    new = [x for x in json.loads(Path(path).read_text(encoding="utf-8")) if phrase_id(x) not in have]
    merged = base + new
    target.write_text("[\n" + ",\n".join("  " + json.dumps(x, ensure_ascii=False) for x in merged) + "\n]\n",
                      encoding="utf-8")
    print(f"+{len(new)} -> {target.name} has {len(merged)}")


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "check":
        sys.exit(check(sys.argv[2], sys.argv[3].lower()))
    elif cmd == "merge":
        merge(sys.argv[2], sys.argv[3].lower())
    elif cmd == "build":
        build(sys.argv[2].lower(), audio="--no-audio" not in sys.argv)
