"""Append a checked staging batch to data/content/<level>.json (skips duplicates).

Usage:  .venv/bin/python scripts/merge_batch.py data/content/staging/<file>.json <level>
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_level import ROOT, make_id  # noqa: E402


def normalize_ipa(ipa):
    """House style: no secondary stress after the main stress in a word (/ˈɪreɪk/, not /ˈɪrˌeɪk/)."""
    words = []
    for w in ipa.split(" "):
        if "ˈ" in w:
            head, tail = w.split("ˈ", 1)
            w = head + "ˈ" + tail.replace("ˌ", "")
        words.append(w)
    return " ".join(words)


def tidy(item):
    if item.get("ipa"):
        item["ipa"] = normalize_ipa(item["ipa"])
    if item.get("ipa_words"):
        item["ipa_words"] = {k: normalize_ipa(v) for k, v in item["ipa_words"].items()}
    return item


def main():
    src, level = Path(sys.argv[1]), sys.argv[2].lower()
    dst = ROOT / "data" / "content" / f"{level}.json"
    base = json.loads(dst.read_text(encoding="utf-8")) if dst.exists() else []
    have = {make_id(x["word"], x["pos"]) for x in base}
    new = json.loads(src.read_text(encoding="utf-8"))
    added = [tidy(x) for x in new if make_id(x["word"], x["pos"]) not in have]
    merged = base + added
    dst.write_text("[\n" + ",\n".join("  " + json.dumps(x, ensure_ascii=False) for x in merged) + "\n]\n",
                   encoding="utf-8")
    print(f"{src.name}: +{len(added)} (skipped {len(new) - len(added)} duplicates) -> {dst.name} has {len(merged)}")


if __name__ == "__main__":
    main()
