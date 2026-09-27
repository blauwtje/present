"""Download Amazon Reviews 2023 metadata, filter it and write a balanced product table.

Output: work/products.jsonl, one JSON object per line with keys
asin, title, top_category, path, price_cents, image_key, rating_x10, rating_count, text
"""
import json
import math
import os
import re
import sys

import duckdb
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
TARGET = int(os.environ.get("CATALOG_TARGET", "60000"))
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


def read_candidates(con, cat):
    kind, urls = source_for(cat)
    print(f"{cat}: {kind} x{len(urls)}", flush=True)
    url_list = "[" + ",".join(f"'{u}'" for u in urls) + "]"
    if kind == "parquet":
        src = f"read_parquet({url_list}, union_by_name=true)"
    else:
        src = f"read_json({url_list}, format='newline_delimited', ignore_errors=true, maximum_object_size=67108864)"
    sql = f"""
        SELECT parent_asin, title, main_category, categories, images,
               TRY_CAST(price AS DOUBLE) AS price,
               TRY_CAST(average_rating AS DOUBLE) AS average_rating,
               TRY_CAST(rating_number AS BIGINT) AS rating_number
        FROM {src}
        WHERE TRY_CAST(rating_number AS BIGINT) >= {MIN_RATINGS}
          AND TRY_CAST(average_rating AS DOUBLE) >= {MIN_AVG}
          AND TRY_CAST(price AS DOUBLE) > 0
          AND title IS NOT NULL AND length(title) > 0
    """
    return con.execute(sql).fetchall(), [d[0] for d in con.description]


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
    key = image_key(rec["images"])
    if not key:
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
        "rating_count": int(rec["rating_number"]),
        "text": f"{title}. {' / '.join(tail)}",
    }


def balance(per_cat, target):
    """Give every category an equal share; unused share goes to the others in order."""
    for rows in per_cat.values():
        rows.sort(key=lambda r: r["rating_count"], reverse=True)
    quota = {c: 0 for c in per_cat}
    left = target
    open_cats = [c for c in per_cat if per_cat[c]]
    while left > 0 and open_cats:
        share = max(1, math.ceil(left / len(open_cats)))
        nxt = []
        for c in open_cats:
            take = min(share, len(per_cat[c]) - quota[c], left)
            quota[c] += take
            left -= take
            if quota[c] < len(per_cat[c]):
                nxt.append(c)
            if left == 0:
                break
        open_cats = nxt
    return [r for c in per_cat for r in per_cat[c][: quota[c]]]


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "work"
    os.makedirs(out_dir, exist_ok=True)
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("SET http_retries = 8; SET http_timeout = 120000;")
    if os.environ.get("HF_TOKEN"):
        con.execute(f"CREATE SECRET hf (TYPE HUGGINGFACE, TOKEN '{os.environ['HF_TOKEN']}')")
    per_cat = {}
    seen = set()
    for cat in CATEGORIES:
        rows, cols = read_candidates(con, cat)
        kept = []
        for values in rows:
            rec = dict(zip(cols, values))
            if not rec["parent_asin"] or rec["parent_asin"] in seen:
                continue
            row = to_row(cat, rec)
            if row:
                seen.add(row["asin"])
                kept.append(row)
        per_cat[cat] = kept
        print(f"{cat}: {len(kept)} candidates", flush=True)
    rows = balance(per_cat, TARGET)
    counts = {c: sum(1 for r in rows if r["top_category"] == c) for c in CATEGORIES}
    print("selected per category:", counts, flush=True)
    print(f"selected total: {len(rows)}", flush=True)
    with open(os.path.join(out_dir, "products.jsonl"), "w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
