"""Download Amazon Reviews 2023 metadata for one category and filter it.

Output: one JSON object per line with keys
asin, title, top_category, path, price_cents, image_key, rating_x10, rating_count, text
"""
import json
import os
import re
import sys
import time

import pyarrow.parquet as pq
import requests

REPO = "McAuley-Lab/Amazon-Reviews-2023"
API = f"https://huggingface.co/api/datasets/{REPO}/tree"
RESOLVE = f"https://huggingface.co/datasets/{REPO}/resolve"
CATEGORIES = [
    "Toys_and_Games", "Video_Games", "Books", "Home_and_Kitchen", "Sports_and_Outdoors",
    "Electronics", "Arts_Crafts_and_Sewing", "Musical_Instruments", "Handmade_Products",
    "Beauty_and_Personal_Care", "Clothing_Shoes_and_Jewelry", "Office_Products",
    "Grocery_and_Gourmet_Food",
]
PER_CATEGORY = int(os.environ.get("CANDIDATES_PER_CATEGORY", "8000"))
MIN_RATINGS = 50
MIN_AVG = 4.0
IMAGE_RE = re.compile(r"^https://m\.media-amazon\.com/images/I/([A-Za-z0-9+%_-]+)\.")
HEADERS = {"Authorization": f"Bearer {os.environ['HF_TOKEN']}"} if os.environ.get("HF_TOKEN") else {}


def list_files(revision, path):
    url = f"{API}/{requests.utils.quote(revision, safe='')}/{path}?recursive=true"
    r = requests.get(url, headers=HEADERS, timeout=60)
    if r.status_code == 404:
        return []
    r.raise_for_status()
    return [e["path"] for e in r.json() if e.get("type") == "file"]


def source_for(cat):
    """Return (kind, [urls]) for a category, trying parquet layouts before jsonl."""
    for revision, directory in (
        ("main", f"raw_meta_{cat}"),
        ("refs/convert/parquet", f"raw_meta_{cat}"),
    ):
        files = [f for f in list_files(revision, directory) if f.endswith(".parquet")]
        if files:
            rev = requests.utils.quote(revision, safe="")
            return "parquet", [f"{RESOLVE}/{rev}/{f}" for f in sorted(files)]
    return "json", [f"{RESOLVE}/main/raw/meta_categories/meta_{cat}.jsonl"]


NEEDED = ["parent_asin", "title", "main_category", "categories", "images", "price", "average_rating", "rating_number"]
PRICE_RE = re.compile(r"\d+(?:[.,]\d+)?")


def to_float(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = PRICE_RE.search(str(v).replace(",", ""))
    return float(m.group(0)) if m else None


def keep(rec):
    """Cheap filter on rating, count and price before anything heavier is read."""
    count = to_float(rec.get("rating_number"))
    avg = to_float(rec.get("average_rating"))
    price = to_float(rec.get("price"))
    if count is None or count < MIN_RATINGS or avg is None or avg < MIN_AVG or not price or price <= 0:
        return False
    rec["rating_number"], rec["average_rating"], rec["price"] = int(count), avg, price
    return True


def download(url, dest):
    """Download a whole file; reading remote parquet in small ranges is far too slow."""
    t0 = time.time()
    with requests.get(url, headers=HEADERS, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(dest, "wb") as fh:
            for chunk in r.iter_content(chunk_size=8 << 20):
                fh.write(chunk)
    size = os.path.getsize(dest)
    print(f"  downloaded {size / 1e6:.0f} MB in {time.time() - t0:.0f}s", flush=True)


def iter_parquet(path):
    pf = pq.ParquetFile(path)
    names = set(pf.schema_arrow.names)
    cols = [c for c in NEEDED if c in names]
    cheap = [c for c in ("rating_number", "average_rating", "price") if c in names]
    for i in range(pf.num_row_groups):
        light = pf.read_row_group(i, columns=cheap).to_pylist()
        idx = [j for j, rec in enumerate(light) if keep(rec)]
        if not idx:
            continue
        full = pf.read_row_group(i, columns=cols).take(idx).to_pylist()
        for rec, cheap_rec in zip(full, (light[j] for j in idx)):
            rec.update(cheap_rec)
            yield rec


def iter_jsonl(path):
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            if keep(rec):
                yield rec


def read_candidates(cat, tmp_dir):
    kind, urls = source_for(cat)
    print(f"{cat}: {kind} x{len(urls)}", flush=True)
    for n, url in enumerate(urls):
        dest = os.path.join(tmp_dir, f"{cat}-{n}.{kind}")
        download(url, dest)
        try:
            yield from (iter_parquet(dest) if kind == "parquet" else iter_jsonl(dest))
        finally:
            os.remove(dest)


def image_urls(images):
    """Images arrive as a list of structs or as a struct of lists; yield every URL."""
    if images is None:
        return
    if isinstance(images, dict):
        for key in ("large", "hi_res", "thumb"):
            for u in images.get(key) or []:
                if u:
                    yield u
        return
    for item in images:
        if isinstance(item, dict):
            for key in ("large", "hi_res", "thumb"):
                if item.get(key):
                    yield item[key]
        elif isinstance(item, str):
            yield item


def image_key(images):
    for u in image_urls(images):
        m = IMAGE_RE.match(u)
        if m:
            return m.group(1)
    return None


def to_row(cat, rec):
    key = image_key(rec.get("images"))
    if not key or not rec.get("title"):
        return None
    cats = [c for c in (rec["categories"] or []) if c]
    path = " > ".join(cats) if cats else (rec["main_category"] or cat.replace("_", " "))
    tail = cats[-2:] if cats else [rec["main_category"] or cat.replace("_", " ")]
    title = " ".join(str(rec["title"]).split())[:200]
    return {
        "asin": rec["parent_asin"],
        "title": title,
        "top_category": cat,
        "path": path,
        "price_cents": int(round(rec["price"] * 100)),
        "image_key": key,
        "rating_x10": int(round(rec["average_rating"] * 10)),
        "rating_count": rec["rating_number"],
        "text": f"{title}. {' / '.join(tail)}",
    }


def main():
    """Usage: fetch_filter.py <out dir> <category>

    Writes <out dir>/<category>.jsonl: the category's filtered products, most reviewed first,
    at most CANDIDATES_PER_CATEGORY of them. embed.mjs balances the categories when it packs.
    """
    out_dir, cat = sys.argv[1], sys.argv[2]
    if cat not in CATEGORIES:
        sys.exit(f"unknown category {cat}")
    os.makedirs(out_dir, exist_ok=True)
    tmp_dir = os.path.join(out_dir, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    t0 = time.time()
    rows = {}
    for rec in read_candidates(cat, tmp_dir):
        asin = rec.get("parent_asin")
        if not asin or asin in rows:
            continue
        row = to_row(cat, rec)
        if row:
            rows[asin] = row
    kept = sorted(rows.values(), key=lambda r: r["rating_count"], reverse=True)[:PER_CATEGORY]
    print(f"{cat}: {len(rows)} pass the filter, kept {len(kept)} in {time.time() - t0:.0f}s", flush=True)
    with open(os.path.join(out_dir, f"{cat}.jsonl"), "w", encoding="utf-8") as fh:
        for row in kept:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
