#!/usr/bin/env python3
"""Standardise raw dish photos into the committed card-art set.

Per raw_images/{id}.{jpg|jpeg|png|webp}:
    rembg cutout -> alpha trim -> level normalisation -> scale to ~75% of the canvas,
    centred -> composite onto a warm-neutral backdrop -> public/images/dishes/{id}.jpg
    -> rebuild the runtime manifest (public/images/manifest.json).

Pipeline bookkeeping (input + config hashes for re-processing detection) lives in
scripts/.image-cache.json and NEVER in the runtime manifest.

Usage:
    python scripts/standardise_images.py [--force] [--only id1,id2]
        [--backdrop "#EDE7DD"] [--size 1024] [--scale 0.75]
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps
from rembg import remove

PIPELINE_VERSION = 1
ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "raw_images"
OUT_DIR = ROOT / "public" / "images" / "dishes"
MANIFEST = ROOT / "public" / "images" / "manifest.json"
CACHE_FILE = ROOT / "scripts" / ".image-cache.json"
DECK_FILE = ROOT / "shared" / "data" / "deck.ts"
RAW_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="reprocess even when hashes match")
    parser.add_argument("--only", default=None, help="comma-separated dish ids to process")
    parser.add_argument("--backdrop", default="#EDE7DD", help="backdrop colour (matches the card face)")
    parser.add_argument("--size", type=int, default=1024, help="output canvas size in px")
    parser.add_argument("--scale", type=float, default=0.75, help="subject share of the canvas")
    return parser.parse_args()


def config_hash(args: argparse.Namespace) -> str:
    payload = json.dumps(
        {"backdrop": args.backdrop, "size": args.size, "scale": args.scale, "version": PIPELINE_VERSION},
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def deck_ids() -> set[str]:
    # deck.ts is TypeScript — a regex keeps the sanity check honest without coupling.
    try:
        source = DECK_FILE.read_text(encoding="utf-8")
        return set(re.findall(r"id:\s*['\"]([a-z0-9-]+)['\"]", source))
    except OSError:
        return set()


def load_cache() -> dict:
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def process(raw_path: Path, out_path: Path, backdrop: str, size: int, scale: float) -> None:
    with Image.open(raw_path) as source:
        cutout = remove(source.convert("RGBA"))

    bbox = cutout.getchannel("A").getbbox()
    if bbox is not None:
        cutout = cutout.crop(bbox)

    # Normalise levels BEFORE compositing so the backdrop colour is never shifted.
    rgb = cutout.convert("RGB")
    normalised = ImageOps.autocontrast(rgb, cutoff=1)
    cutout = Image.merge("RGBA", (*normalised.split(), cutout.getchannel("A")))

    target = int(size * scale)
    ratio = target / max(cutout.width, cutout.height)
    cutout = cutout.resize((max(1, round(cutout.width * ratio)), max(1, round(cutout.height * ratio))), Image.LANCZOS)

    canvas = Image.new("RGB", (size, size), backdrop)
    offset = ((size - cutout.width) // 2, (size - cutout.height) // 2)
    canvas.paste(cutout, offset, cutout)
    canvas.save(out_path, "JPEG", quality=82, progressive=True)


def rebuild_manifest() -> int:
    # Self-healing: the manifest is rebuilt from the directory listing, so it can never
    # reference a missing file and never carries pipeline bookkeeping.
    ids = sorted(p.stem for p in OUT_DIR.glob("*.jpg"))
    MANIFEST.write_text(json.dumps({"dishes": ids}, indent=4) + "\n", encoding="utf-8")
    return len(ids)


def main() -> int:
    args = parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    only = set(args.only.split(",")) if args.only else None
    cache = load_cache()
    cfg_hash = config_hash(args)
    known_ids = deck_ids()

    raws = sorted(p for p in RAW_DIR.iterdir() if p.suffix.lower() in RAW_EXTENSIONS)
    processed = skipped = failed = 0
    seen_stems: set[str] = set()

    for raw_path in raws:
        dish_id = raw_path.stem
        if only is not None and dish_id not in only:
            continue
        if dish_id in seen_stems:
            print(f"warn: duplicate raw file for {dish_id} ({raw_path.name}) — skipped; keep one file per id")
            continue
        seen_stems.add(dish_id)
        if known_ids and dish_id not in known_ids:
            print(f"warn: {dish_id} is not a deck id (processing anyway)")

        input_hash = hashlib.sha256(raw_path.read_bytes()).hexdigest()
        out_path = OUT_DIR / f"{dish_id}.jpg"
        entry = cache.get(dish_id)
        if not isinstance(entry, dict):   # hand-edited or partially-written cache entries
            entry = None
        if (
            not args.force
            and entry is not None
            and entry.get("input") == input_hash
            and entry.get("config") == cfg_hash
            and out_path.exists()
        ):
            skipped += 1
            continue

        try:
            process(raw_path, out_path, args.backdrop, args.size, args.scale)
            cache[dish_id] = {"input": input_hash, "config": cfg_hash}
            processed += 1
            print(f"ok: {dish_id}")
        except Exception as error:  # noqa: BLE001 — a bad photo must not kill the batch
            failed += 1
            print(f"fail: {dish_id}: {error}", file=sys.stderr)

    CACHE_FILE.write_text(json.dumps(cache, indent=4, sort_keys=True) + "\n", encoding="utf-8")
    total = rebuild_manifest()
    print(f"\nprocessed {processed} · skipped {skipped} (cache) · failed {failed} · manifest now lists {total} dishes")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
