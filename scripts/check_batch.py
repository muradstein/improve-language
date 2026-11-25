"""Check a staging batch before it is merged into data/content/<level>.json.

Usage:  .venv/bin/python scripts/check_batch.py data/content/staging/<file>.json <level>

Checks: JSON shape, required fields, CEFR level of each (word, pos), duplicates
(inside the batch and against data/content/<level>.json), headword and sentence
IPA from CMUdict, heteronyms that need an override, digits in sentences.
Writes nothing. Exit code 0 = no errors (review items may remain).
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_level import ROOT, ambiguous_tokens, headword_ipa, load_levels, make_id  # noqa: E402
from ipa_us import CmuIpa  # noqa: E402

REQUIRED = ("word", "pos", "az", "example", "example_az")
ALLOWED = set(REQUIRED) | {"note", "ipa", "ipa_words", "syllabus", "example_ipa"}


def main():
    path, level = Path(sys.argv[1]), sys.argv[2].lower()
    try:
        items = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"ERROR invalid JSON: {e}")
        sys.exit(1)

    levels, cmu = load_levels(), CmuIpa()
    content_file = ROOT / "data" / "content" / f"{level}.json"
    existing = set()
    if content_file.exists():
        existing = {make_id(x["word"], x["pos"]) for x in json.loads(content_file.read_text(encoding="utf-8"))}

    errors, review, seen = [], [], set()
    for n, item in enumerate(items, 1):
        where = f"#{n} {item.get('word', '?')}"
        missing = [k for k in REQUIRED if not str(item.get(k, "")).strip()]
        if missing:
            errors.append(f"{where}: missing {missing}")
            continue
        extra = set(item) - ALLOWED
        if extra:
            errors.append(f"{where}: unknown fields {sorted(extra)}")
        word, pos = item["word"], item["pos"]
        wid = make_id(word, pos)
        if wid in seen:
            errors.append(f"{where}: duplicate in batch")
        if wid in existing:
            errors.append(f"{where}: already in {content_file.name}")
        seen.add(wid)

        cefr, _ = levels.get((word.lower(), pos), (None, None))
        if cefr is None:
            errors.append(f"{where} ({pos}): not in CEFR lists with this part of speech")
        elif cefr.lower() != level:
            errors.append(f"{where} ({pos}): level is {cefr}, not {level.upper()}")

        if re.search(r"\d", item["example"]):
            errors.append(f"{where}: digits in example — write numbers as words")
        if word.lower() not in item["example"].lower() and len(word) > 3 and word.lower()[:-1] not in item["example"].lower():
            review.append(f"{where}: example may not contain the headword: \"{item['example']}\"")

        if not item.get("ipa"):
            ipa, _ = headword_ipa(cmu, word)
            if ipa is None:
                errors.append(f"{where}: headword not in CMUdict — add \"ipa\": \"/.../\" (American)")
        overrides = dict(item.get("ipa_words", {}))
        if item.get("ipa") and " " not in word:
            overrides.setdefault(word.lower(), item["ipa"].strip("/"))
        _, problems = cmu.sentence(item["example"], overrides)
        errors += [f"{where}: {p} — add it to \"ipa_words\" or reword" for p in problems]
        review += [f"{where}: \"{item['example']}\" — {a} — if wrong here, add to \"ipa_words\""
                   for a in ambiguous_tokens(cmu, item["example"], overrides)]

    print(f"{len(items)} entries, {len(errors)} errors, {len(review)} review items")
    for e in errors:
        print("ERROR ", e)
    for r in review:
        print("REVIEW", r)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
