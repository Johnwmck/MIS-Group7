"""One-time seed catalog enrichment: fills broken covers, short descriptions,
and author bios in Seed Data/Team7_SeedBooks.csv from public book APIs.

Usage (from the repo root):
    python3 tools/enrich_seed_books.py            # rewrite the CSV in place
    python3 tools/enrich_seed_books.py --dry-run  # report only, no write

Sources: Open Library and Google Books for covers/descriptions (looked up by
ISBN), Wikipedia page summaries for author bios (one lookup per primary author).
Anything it cannot resolve is left as-is and listed in the report so it can be
fixed by hand in the admin portal. Re-running is safe: filled values are kept.
"""

import argparse
import csv
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent.parent / "Seed Data" / "Team7_SeedBooks.csv"
USER_AGENT = "Team7Books-SeedEnrichment/1.0 (https://github.com/Johnwmck/MIS-Group7)"

SHORT_DESCRIPTION_CHARS = 200
# Open Library serves a 43-byte blank GIF for unknown ISBNs; real covers are KBs.
MIN_COVER_BYTES = 1000
AUTHOR_WORDS = ("novelist", "writer", "author", "poet", "playwright", "journalist",
                "essayist", "screenwriter", "illustrator", "historian", "philosopher",
                "economist", "humorist", "cartoonist", "biographer", "memoirist",
                "diarist", "comedian")
MAX_BIO_CHARS = 900
# Reviewed by hand: the longer text found was an excerpt, bibliographic notes,
# another language, or a different edition, so keep the original description.
KEEP_DESCRIPTION_IDS = {"15", "25", "121", "251", "352", "573"}

# --- HTTP helpers ---

def fetch(url, retries=5):
    """Return (status, bytes); status 0 means a network failure."""
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=20) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt < retries - 1:
                time.sleep(2 ** (attempt + 1))
                continue
            return error.code, b""
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt < retries - 1:
                time.sleep(1)
                continue
            return 0, b""
    return 0, b""


def fetch_json(url):
    status, body = fetch(url)
    if status != 200:
        return None
    try:
        return json.loads(body)
    except ValueError:
        return None


def is_real_cover(url):
    if not url:
        return False
    status, body = fetch(url)
    return status == 200 and len(body) >= MIN_COVER_BYTES

# --- Lookups ---

google_cache = {}
google_blocked = False


def google_volume(isbn):
    """Google Books volume info; disabled for the run after its first 429."""
    global google_blocked
    if google_blocked:
        return {}
    if isbn not in google_cache:
        status, body = fetch("https://www.googleapis.com/books/v1/volumes?q=isbn:" + isbn, retries=1)
        if status == 429:
            google_blocked = True
            print("  (Google Books is rate-limiting; using Open Library only)", flush=True)
            return {}
        try:
            items = json.loads(body).get("items") or [] if status == 200 else []
        except ValueError:
            items = []
        google_cache[isbn] = items[0].get("volumeInfo", {}) if items else {}
    return google_cache[isbn]


def open_library_search(row):
    """Best Open Library search hit for this title and primary author."""
    query = urllib.parse.urlencode({
        "title": re.split(r"[:(]", row["title"])[0].strip(),
        "author": primary_author(row["author"]),
        "fields": "key,cover_i", "limit": 5})
    data = fetch_json("https://openlibrary.org/search.json?" + query) or {}
    return data.get("docs") or []


def find_cover(row):
    candidate = f"https://covers.openlibrary.org/b/isbn/{row['isbn']}-L.jpg?default=false"
    if is_real_cover(candidate):
        return candidate
    for doc in open_library_search(row):
        if doc.get("cover_i"):
            candidate = f"https://covers.openlibrary.org/b/id/{doc['cover_i']}-L.jpg"
            if is_real_cover(candidate):
                return candidate
    links = google_volume(row["isbn"]).get("imageLinks") or {}
    for key in ("extraLarge", "large", "medium", "thumbnail"):
        if key in links:
            url = links[key].replace("http://", "https://").replace("&edge=curl", "")
            if is_real_cover(url):
                return url
    return None


def clean_text(text):
    if isinstance(text, dict):
        text = text.get("value")
    text = (text or "").replace("\r\n", "\n")
    text = re.sub(r"<br\s*/?>|</p>", "\n", text, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    # Open Library descriptions often trail off into source notes and link lists.
    text = re.split(r"\n\s*(?:-{3,}|\(?\[?source|also contained in|see also)", text, flags=re.I)[0]
    text = re.sub(r"\s*(?:\(back cover\)|--\s*back cover|\(jacket\)|amazon review|"
                  r"--\s*from publisher description\.?|from the hardcover edition\.?|--)\s*$",
                  "", text.strip(), flags=re.I)
    text = re.sub(r"(?<=[a-z][.!?])(?=[A-Z])", " ", text)  # "back!Becky" -> "back! Becky"
    text = text.strip()
    if text.startswith('"') and text.endswith('"') and text.count('"') == 2:
        text = text[1:-1].strip()
    return re.sub(r"\n{3,}", "\n\n", text)


def find_description(row):
    """Longest description among Google Books and the Open Library edition/work."""
    candidates = [clean_text(google_volume(row["isbn"]).get("description"))]
    edition = fetch_json(f"https://openlibrary.org/isbn/{row['isbn']}.json") or {}
    candidates.append(clean_text(edition.get("description")))
    work_keys = [work["key"] for work in edition.get("works", [])]
    work_keys += [doc["key"] for doc in open_library_search(row)[:1]]
    for key in work_keys[:2]:
        work = fetch_json(f"https://openlibrary.org{key}.json") or {}
        candidates.append(clean_text(work.get("description")))
    return max(candidates, key=len)


def primary_author(author):
    return author.split(",")[0].strip()


def wikipedia_summary(title):
    data = fetch_json("https://en.wikipedia.org/api/rest_v1/page/summary/" +
                      urllib.parse.quote(title.replace(" ", "_")))
    if not data or data.get("type") != "standard" or not data.get("extract"):
        return None
    return data


def find_bio(name):
    """Return (bio, confident). Not confident = no match or not clearly a writer.
    Tries the plain name first, then disambiguated titles like "Name (author)"."""
    fallback = None
    for title in (name, f"{name} (author)", f"{name} (writer)", f"{name} (novelist)"):
        data = wikipedia_summary(title)
        if not data:
            continue
        summary = (data.get("description", "") + " " + data["extract"][:300]).lower()
        bio = data["extract"].strip()
        if len(bio) > MAX_BIO_CHARS:
            bio = bio[:MAX_BIO_CHARS].rsplit(". ", 1)[0] + "."
        if any(word in summary for word in AUTHOR_WORDS):
            return bio, True
        fallback = fallback or bio
    return fallback or "", False

# --- Enrichment pass ---

def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="report without writing the CSV")
    args = parser.parse_args()

    with CSV_PATH.open(newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        fieldnames = list(reader.fieldnames)
        rows = list(reader)
    if "authorBio" not in fieldnames:
        fieldnames.append("authorBio")
        for row in rows:
            row["authorBio"] = ""

    report = {"covers": [], "covers_missing": [], "descriptions": [],
              "descriptions_short": [], "bios_unsure": [], "bios_missing": []}

    print(f"Checking {len(rows)} cover images...")
    with ThreadPoolExecutor(max_workers=12) as pool:
        cover_ok = list(pool.map(lambda row: is_real_cover(row["image"]), rows))

    print(f"{cover_ok.count(False)} covers broken; looking up replacements and short descriptions...")
    for row, ok in zip(rows, cover_ok):
        label = f'{row["id"]} {row["title"]}'
        if not ok or len(row["description"]) < SHORT_DESCRIPTION_CHARS:
            print("  " + label, flush=True)
        if not ok:
            replacement = find_cover(row)
            if replacement:
                row["image"] = replacement
                report["covers"].append(label)
            else:
                report["covers_missing"].append(label)
        if len(row["description"]) < SHORT_DESCRIPTION_CHARS and row["id"] not in KEEP_DESCRIPTION_IDS:
            longer = find_description(row)
            if len(longer) > len(row["description"]):
                row["description"] = longer
                report["descriptions"].append(label)
            else:
                report["descriptions_short"].append(label)

    authors = sorted({primary_author(row["author"]) for row in rows if not row["authorBio"]})
    print(f"Looking up {len(authors)} author bios...")
    # Sequential and paced: Wikipedia rate-limits bursts of anonymous requests.
    bios = {}
    for name in authors:
        bios[name] = find_bio(name)
        print(f"  {name}: {'ok' if bios[name][1] else 'skipped'}", flush=True)
        time.sleep(0.5)
    for name, (bio, confident) in bios.items():
        if not bio:
            report["bios_missing"].append(name)
        elif not confident:
            report["bios_unsure"].append(f"{name}: {bio[:100]}...")
    # Unsure matches stay blank: a wrong person's bio is worse than none.
    for row in rows:
        bio, confident = bios.get(primary_author(row["author"]), ("", False))
        if not row["authorBio"] and confident:
            row["authorBio"] = bio

    titles = {
        "covers": "Covers replaced", "covers_missing": "Covers still missing (fix by hand)",
        "descriptions": "Descriptions lengthened",
        "descriptions_short": "Descriptions still short (no longer source found)",
        "bios_unsure": "Bios skipped as unsure (Wikipedia page may not be the author)",
        "bios_missing": "Authors with no bio found",
    }
    for key, title in titles.items():
        print(f"\n{title}: {len(report[key])}")
        for line in report[key]:
            print("  - " + line)

    if args.dry_run:
        print("\nDry run: CSV not written.")
        return
    with CSV_PATH.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"\nWrote {CSV_PATH}")


if __name__ == "__main__":
    sys.exit(main())
