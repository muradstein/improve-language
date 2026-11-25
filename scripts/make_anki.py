"""Export built levels to an Anki deck (.apkg) with audio.

Usage:  .venv/bin/python scripts/make_anki.py a2 [b1 ...]
Output: build/english-<levels>.apkg   -> Anki: File > Import
"""

import html
import json
import sys
from pathlib import Path

import genanki

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

# Fixed ids: re-importing an updated deck updates cards instead of duplicating them.
MODEL_ID = 1732540001
DECK_ID = 1732540002

CSS = """
.card { font-family: system-ui, sans-serif; font-size: 20px; text-align: center;
        color: #1f2328; background: #fff; padding: 12px; }
.nightMode.card, .night_mode .card { color: #e6edf3; background: #1e1e1e; }
.word { font-size: 38px; font-weight: 600; margin-top: 8px; }
.meta { font-size: 15px; opacity: .65; margin-top: 4px; }
.example { font-style: italic; margin-top: 18px; }
.az { font-size: 26px; font-weight: 600; color: #0b7a5a; margin-top: 6px; }
.nightMode .az, .night_mode .az { color: #4ad6a5; }
.example-az { margin-top: 8px; opacity: .8; }
.note { font-size: 15px; margin-top: 16px; padding: 8px 12px; border-radius: 8px;
        background: rgba(255, 196, 0, .15); display: inline-block; }
"""

FRONT = """
<div class="word">{{Word}}</div>
<div class="meta">{{Level}} · {{POS}}</div>
{{WordAudio}}
<div class="example">{{Example}}</div>
"""

BACK = """
{{FrontSide}}
<hr id="answer">
<div class="az">{{Meaning}}</div>
<div class="meta">{{IPA}}</div>
<div class="example-az">{{ExampleAz}}</div>
{{ExampleAudio}}
{{#Note}}<div class="note">💡 {{Note}}</div>{{/Note}}
"""

FIELDS = ["Id", "Word", "POS", "Level", "IPA", "Meaning", "Example", "ExampleAz", "Note",
          "WordAudio", "ExampleAudio"]

model = genanki.Model(
    MODEL_ID, "Improve English (word)",
    fields=[{"name": f} for f in FIELDS],
    templates=[{"name": "EN → AZ", "qfmt": FRONT, "afmt": BACK}],
    css=CSS,
    sort_field_index=1,
)


class WordNote(genanki.Note):
    @property
    def guid(self):  # stable per word, so re-imports update existing cards
        return genanki.guid_for(self.fields[0])


def main():
    levels = [a.lower() for a in sys.argv[1:]] or ["a2"]
    deck = genanki.Deck(DECK_ID, "English")
    media = []
    for level in levels:
        words = json.loads((PUBLIC / "words" / f"{level}.json").read_text(encoding="utf-8"))
        for w in words:
            def sound(key):
                if key not in w:
                    return ""
                media.append(str(PUBLIC / w[key]))
                return f"[sound:{Path(w[key]).name}]"

            e = html.escape
            deck.add_note(WordNote(model=model, tags=[w["level"], w["pos"]] + (["syllabus"] if w.get("syllabus") else []),
                                   fields=[w["id"], e(w["word"]), w["pos"], w["level"], e(w["ipa"] or ""),
                                           e(w["az"]), e(w["example"]), e(w["example_az"]), e(w.get("note", "")),
                                           sound("audio"), sound("audio_example")]))
    out = ROOT / "build" / f"english-{'-'.join(levels)}.apkg"
    out.parent.mkdir(exist_ok=True)
    genanki.Package(deck, media_files=media).write_to_file(out)
    print(f"Wrote {len(deck.notes)} cards, {len(media)} audio files -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
