"""American English IPA from the CMU Pronouncing Dictionary.

    >>> from ipa_us import CmuIpa
    >>> ipa = CmuIpa()
    >>> ipa.word("disappointed")          # '/ˌdɪsəˈpɔɪntɪd/'
    >>> ipa.sentence("I was disappointed.") # ('/aɪ wʌz ˌdɪsəˈpɔɪntɪd/', [])

Conventions (American learner-dictionary style):
- stress marks ˈ ˌ go before the syllable, monosyllables get none;
- stressed AH = ʌ, unstressed AH = ə; stressed ER = ɝ, unstressed ER = ɚ;
- no length marks (i, u, ɑ), r is written r.
"""

import re
import unicodedata
from pathlib import Path

CMUDICT = Path(__file__).resolve().parent.parent / "data" / "sources" / "cmudict.dict"

VOWELS = {
    "AA": "ɑ", "AE": "æ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ", "EH": "ɛ", "EY": "eɪ",
    "IH": "ɪ", "IY": "i", "OW": "oʊ", "OY": "ɔɪ", "UH": "ʊ", "UW": "u",
}
CONSONANTS = {
    "B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ", "HH": "h", "JH": "dʒ",
    "K": "k", "L": "l", "M": "m", "N": "n", "NG": "ŋ", "P": "p", "R": "r", "S": "s",
    "SH": "ʃ", "T": "t", "TH": "θ", "V": "v", "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ",
}
# Consonant clusters that can start an English syllable (maximal onset principle).
ONSETS = {tuple(o.split()) for o in """
P R|P L|B R|B L|T R|D R|K R|K L|G R|G L|F R|F L|TH R|SH R|S P|S T|S K|S M|S N|S L|S W|S F
S P R|S T R|S K R|S P L|S K W|T W|D W|K W|G W|TH W|P Y|B Y|F Y|M Y|K Y|V Y|HH Y|S K Y|S P Y
""".replace("\n", "|").split("|") if o.strip()}


def is_vowel(phone):
    return phone[-1].isdigit()


def phone_ipa(phone):
    if not is_vowel(phone):
        return CONSONANTS[phone]
    base, stress = phone[:-1], phone[-1]
    if base == "AH":
        return "ʌ" if stress in "12" else "ə"  # AH2 is a full vowel too: /ˌʌndɚˈstænd/
    if base == "ER":
        return "ɝ" if stress == "1" else "ɚ"
    return VOWELS[base]


def syllabify(phones):
    """Split ARPABET phones into syllables; consonants between vowels go to the
    next syllable as far as they form a legal onset."""
    nuclei = [i for i, p in enumerate(phones) if is_vowel(p)]
    if len(nuclei) <= 1:
        return [phones]
    starts = [0]
    for prev, nxt in zip(nuclei, nuclei[1:]):
        cluster = phones[prev + 1:nxt]
        split = len(cluster)  # default: all consonants to the next syllable is illegal; find the longest legal onset
        for k in range(len(cluster) + 1):
            onset = tuple(cluster[k:])
            if len(onset) <= 1 and (not onset or onset[0] != "NG") or onset in ONSETS:
                split = k
                break
        starts.append(prev + 1 + split)
    return [phones[a:b] for a, b in zip(starts, starts[1:] + [len(phones)])]


PREFIX_I = ("re", "pre", "de", "be")  # unstressed: /rɪˈɡrɛt/, /prɪˈpɛr/, /dɪˈpɛnd/, /bɪˈfɔr/


def arpabet_to_ipa(phones, spelling=""):
    phones = list(phones)
    syllables = syllabify(phones)
    stresses = [next((p[-1] for p in syl if is_vowel(p)), "0") for syl in syllables]
    primary = stresses.index("1") if "1" in stresses else len(syllables)

    # Learner dictionaries write an unstressed word-initial a- before the main stress as ə
    # (advice /ədˈvaɪs/, accept /əkˈsɛpt/) and the un- prefix as ʌ (unusual /ʌnˈjuʒuəl/).
    first = syllables[0]
    if primary > 0 and first and first[0] == "AE0":
        first[0] = "AH0"
    un_prefix = primary > 0 and first[:2] == ["AH0", "N"]
    if primary > 0 and spelling.startswith(PREFIX_I) and stresses[0] == "0":
        first[:] = ["IH0" if p in ("IY0", "AH0") else p for p in first]

    out = []
    for n, syl in enumerate(syllables):
        stress = stresses[n]
        if stress == "2" and (n > primary or n == primary - 1):
            # no secondary stress after the main one (/ˈækʃuəli/) or right before it (/dɪˈsaɪd/)
            stress = "0"
        mark = {"1": "ˈ", "2": "ˌ"}.get(stress, "") if len(syllables) > 1 else ""
        sounds = "".join(phone_ipa(p) for p in syl)
        if n == 0 and un_prefix:
            sounds = "ʌ" + sounds[1:]
        out.append(mark + sounds)
    return "".join(out)


def normalize_token(token):
    token = unicodedata.normalize("NFKD", token).encode("ascii", "ignore").decode()  # café -> cafe
    return token.lower().replace("’", "'").strip("'")


# Dictionary (citation) forms where CMUdict's first variant is a reduced or odd one.
CITATION_FORMS = {"and": "ænd"}


class CmuIpa:
    def __init__(self, path=CMUDICT):
        self.entries = {}
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            line = line.split("#")[0].strip()
            if not line:
                continue
            head, *phones = line.split()
            word = re.sub(r"\(\d+\)$", "", head)  # 'read(2)' -> 'read'
            self.entries.setdefault(word, []).append(phones)

    def variants(self, word):
        """All distinct IPA forms for a word (CMUdict lists alternatives)."""
        seen = []
        key = normalize_token(word)
        for phones in self.entries.get(key, []):
            ipa = arpabet_to_ipa(phones, key)
            if ipa not in seen:
                seen.append(ipa)
        return seen

    def word(self, text):
        """IPA for a headword (may be several words, e.g. 'alarm clock'), or None."""
        parts = []
        for token in text.split():
            v = self.variants(token)
            if not v:
                return None
            parts.append(v[0])
        return "/" + " ".join(parts) + "/"

    def sentence(self, text, overrides=None):
        """IPA for a sentence. Returns (ipa, problems).
        overrides: {"read": "rɛd"} for words CMUdict gets wrong in this context."""
        overrides = {**CITATION_FORMS, **{k.lower(): v for k, v in (overrides or {}).items()}}
        parts, problems = [], []
        for token in re.findall(r"[A-Za-zÀ-ÿ’']+", text):
            key = normalize_token(token)
            if key in overrides:
                parts.append(overrides[key])
                continue
            v = self.variants(key)
            if not v:
                problems.append(f"not in CMUdict: '{token}'")
                parts.append("?")
                continue
            parts.append(v[0])
        for i in range(len(parts) - 1):  # 'the' before a vowel sound: /ði ˈæpəl/
            if parts[i] == "ðə" and parts[i + 1].lstrip("ˈˌ")[:1] in "aeiouæɑɔəɛɪʊʌɚɝ":
                parts[i] = "ði"
        return "/" + " ".join(parts) + "/", problems
