#!/usr/bin/env python3
"""
Prove that no review text reached a generated page.

The generator is *instructed* never to quote or closely paraphrase a review.
An instruction is not evidence. This measures it: the longest run of words
shared between each page and the reviews it was built from.

    python3 examples/verify-no-verbatim.py

Reads the reviews from the app's own SQLite database (data/leadsites.db) and
checks every .html under examples/. Exits non-zero if any page shares a run of
THRESHOLD or more words with a source review.

This is the check the QA stage in docs/pipeline-plan.md turns into a publish
gate. It lives here first because the example sites are the regression baseline.
"""
import json
import pathlib
import re
import sqlite3
import sys

THRESHOLD = 5  # a shared run this long is too close to be coincidence
MAX_RUN = 20   # stop looking beyond this

HERE = pathlib.Path(__file__).resolve().parent
DB = HERE.parent / "data" / "leadsites.db"


def words(text):
    text = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&[a-z]+;|&#\d+;", " ", text)
    return re.findall(r"[a-z0-9']+", text.lower())


def grams(ws, n):
    return {tuple(ws[i:i + n]) for i in range(len(ws) - n + 1)}


def load_reviews():
    if not DB.exists():
        return None
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    rows = con.execute(
        "SELECT name, reviews_json FROM businesses "
        "WHERE reviews_json IS NOT NULL AND reviews_json != '[]'"
    ).fetchall()
    con.close()
    return {name: [r["text"] for r in json.loads(blob)] for name, blob in rows}


def main():
    reviews = load_reviews()
    # Nothing to check against is not a violation - a fresh clone has no
    # database yet, and this has to be safe to wire into CI.
    if not reviews:
        print("  no reviews on file, nothing to check against")
        return 0

    worst = 0
    checked = 0

    for folder in sorted(p for p in HERE.iterdir() if p.is_dir()):
        pages = sorted(folder.glob("*.html"))
        if not pages:
            print(f"  {folder.name}: plan only, no pages rendered")
            continue

        # Match the folder to a business by the name in its plan.
        plan_path = folder / "plan.json"
        title = json.loads(plan_path.read_text())["pages"][0]["title"] if plan_path.exists() else ""
        match = next((n for n in reviews if n.split(" |")[0].lower() in title.lower()), None)
        if not match:
            print(f"  {folder.name}: no matching reviews on file, skipped")
            continue

        source = words(" ".join(reviews[match]))
        for page in pages:
            checked += 1
            page_words = words(page.read_text())
            longest, sample = 0, None
            for n in range(THRESHOLD, MAX_RUN):
                shared = grams(page_words, n) & grams(source, n)
                if not shared:
                    break
                longest, sample = n, next(iter(shared))
            worst = max(worst, longest)
            verdict = "clean" if longest == 0 else f"{longest}-word run: {' '.join(sample)!r}"
            print(f"  {folder.name:<32} {page.name:<12} {verdict}")

    print()
    print(f"  {checked} page(s) checked against {len(reviews)} businesses' reviews")
    print(f"  longest shared run: {worst} words (threshold {THRESHOLD})")

    if worst >= THRESHOLD:
        print("  FAIL: review text reached a page")
        return 1
    print("  PASS: no verbatim reuse")
    return 0


if __name__ == "__main__":
    sys.exit(main())
