#!/usr/bin/env python3
"""Source real, openly-licensed dish photos from Wikimedia Commons.

Two-phase workflow (a human — or Claude — picks the winner between phases; nothing
is auto-committed to raw_images/ sight unseen):

    python scripts/source_images.py candidates --out DIR [--ids id1,id2] [--per-dish 5]
        For every deck dish without a processed photo, search Commons, filter to
        plausible real-photo candidates, download review thumbnails, and build
        labelled contact sheets under DIR/sheets/. Metadata -> DIR/candidates.json.

    python scripts/source_images.py finalize --out DIR --selections FILE
        FILE maps dish id -> chosen candidate index (or null to skip). Downloads
        each pick at full review size into raw_images/{id}.jpg and records
        attribution in public/images/credits.json. Then run standardise_images.py.

Only real photography: candidates whose Commons metadata mentions AI generation
are rejected outright (the deck's no-AI-imagery rule).
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
from pathlib import Path

import requests
from PIL import Image, ImageDraw

# Commons titles are frequently non-Latin; Windows consoles default to cp1252.
for stream in (sys.stdout, sys.stderr):
    stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "raw_images"
OUT_DIR = ROOT / "public" / "images" / "dishes"
CREDITS_FILE = ROOT / "public" / "images" / "credits.json"
DECK_FILE = ROOT / "shared" / "data" / "deck.ts"

API = "https://commons.wikimedia.org/w/api.php"
HEADERS = {"User-Agent": "tindish-image-sourcing/1.0 (private two-user app; lachlan.jones@nagrom.com.au)"}

THUMB_WIDTH = 640          # review-sheet candidates
FULL_WIDTH = 1600          # final raw download (pipeline outputs 1024px canvases)
MIN_SIDE = 640             # reject originals smaller than this on either side
ASPECT_RANGE = (0.5, 2.0)  # reject panoramas and tall crops — they cut out badly

# Commons metadata that disqualifies a candidate. AI terms enforce the no-AI rule;
# the rest catch non-food-photo search hits (maps, menus, logos, storefronts).
REJECT = re.compile(
    r"ai[ -]generated|midjourney|dall[- ]?e|stable diffusion|text[ -]to[ -]image|"
    r"\blogo\b|\bmap\b|\bmenu\b|diagram|poster|packag|supermarket|storefront|restaurant exterior",
    re.IGNORECASE,
)

# Commons-tuned queries per dish id, tried in order until enough candidates found.
# Simple dish names outperform stock-site phrasing ("overhead", "flat lay") here.
QUERIES: dict[str, list[str]] = {
    "chicken-pad-thai": ["pad thai chicken", "pad thai"],
    "beef-pho": ["beef pho", "pho bo"],
    "margherita-pizza": ["margherita pizza", "pizza margherita"],
    "chicken-tikka-masala": ["chicken tikka masala"],
    "pork-banh-mi": ["banh mi"],
    "chicken-burrito": ["burrito"],
    "salmon-poke-bowl": ["salmon poke bowl", "poke bowl"],
    "lamb-souvlaki": ["lamb souvlaki", "souvlaki"],
    "pad-see-ew": ["pad see ew"],
    "chicken-katsu-curry": ["katsu curry"],
    "beef-bulgogi-bowl": ["bulgogi bowl", "bulgogi"],
    "falafel-wrap": ["falafel wrap", "falafel sandwich"],
    "chicken-caesar-salad": ["chicken caesar salad", "caesar salad"],
    "prawn-laksa": ["prawn laksa", "laksa"],
    "katsu-sando": ["katsu sando", "katsu sandwich"],
    "greek-halloumi-salad": ["halloumi salad", "greek salad"],
    "mushroom-risotto": ["mushroom risotto", "risotto"],
    "beef-ragu-tagliatelle": ["tagliatelle ragu", "tagliatelle bolognese", "pasta bolognese"],
    "thai-green-curry": ["thai green curry", "green curry"],
    "roast-chicken-club": ["club sandwich", "chicken sandwich"],
    "courgette-lemon-linguine": ["zucchini pasta", "courgette pasta", "lemon pasta"],
    "vietnamese-noodle-salad": ["bun thit nuong", "vietnamese noodle salad", "bun cha"],
    "baja-fish-tacos": ["fish tacos", "fish taco"],
    "herby-chicken-couscous": ["chicken couscous", "couscous dish"],
    "burrata-tomato-plate": ["burrata tomatoes", "burrata"],
    "truffle-mac-cheese": ["mac and cheese", "macaroni and cheese"],
    "steak-frites": ["steak frites"],
    "pork-belly-bao": ["gua bao", "pork belly bun", "baozi pork"],
    "chicken-quinoa-tabbouleh": ["quinoa tabbouleh", "quinoa salad", "tabbouleh"],
    "miso-salmon-greens": ["miso salmon", "grilled salmon plate"],
    "chicken-veg-stir-fry": ["chicken stir fry", "chicken vegetable stir fry"],
    "tarka-dal": ["tarka dal", "dal rice", "dal curry"],
    "crispy-beef-chow-mein": ["crispy beef noodles", "chow mein beef", "chow mein"],
    "korean-fried-chicken": ["korean fried chicken", "yangnyeom chicken"],
    "lamb-doner-kebab": ["doner kebab"],
    "pastrami-deli-sub": ["pastrami sandwich", "pastrami on rye"],
    "prawn-summer-rolls": ["goi cuon", "summer rolls", "rice paper rolls"],
    "chicken-shawarma-plate": ["chicken shawarma plate", "shawarma plate", "chicken shawarma"],
    "mezze-plate": ["mezze platter", "meze"],
    "salmon-sushi-platter": ["sushi platter", "salmon sushi"],
    "pepperoni-pizza": ["pepperoni pizza"],
    "butter-chicken-naan": ["butter chicken", "murgh makhani"],
    "double-smash-burger": ["smash burger", "cheeseburger"],
    "chirashi-bowl": ["chirashi", "chirashizushi", "sashimi rice bowl"],
    "crispy-duck-pancakes": ["duck pancakes", "peking duck pancake"],
    "piri-piri-chicken": ["piri piri chicken", "peri peri chicken"],
    "falafel-buddha-bowl": ["buddha bowl", "falafel bowl", "falafel plate"],
    "tom-yum-prawn-soup": ["tom yum goong", "tom yum"],
    "chicken-fajitas": ["chicken fajitas", "fajitas"],
    "lamb-rogan-josh": ["rogan josh"],
    "beef-lasagne": ["lasagne", "lasagna"],
    "chicken-gyros": ["gyros pita", "gyros"],
    "tuna-nicoise-salad": ["salade nicoise", "nicoise salad"],
    "chicken-fried-rice": ["chicken fried rice", "fried rice"],
    "shakshuka-flatbread": ["shakshuka"],
    "beef-burrito-bowl": ["burrito bowl"],
    "chicken-satay-skewers": ["chicken satay", "satay skewers", "sate ayam"],
    "prawn-paella": ["seafood paella", "paella"],
    "caprese-ciabatta": ["caprese sandwich", "mozzarella tomato sandwich", "caprese"],
    "teriyaki-chicken-donburi": ["chicken teriyaki rice", "teriyaki donburi", "teriyaki chicken"],
    "lamb-kofta-flatbread": ["lamb kofta", "kofta kebab", "kofte"],
    "gado-gado": ["gado gado", "gado-gado"],
    "smoked-salmon-bagel": ["smoked salmon bagel", "lox bagel", "bagel lox"],
    "mapo-tofu": ["mapo tofu", "mapo doufu"],
    "spanakopita": ["spanakopita"],
    "chicken-pot-pie": ["chicken pot pie", "pot pie"],
    "sausage-traybake": ["roasted sausages vegetables", "sausage bake", "sausages dinner"],
    "pumpkin-soup": ["pumpkin soup"],
    "pesto-gnocchi": ["gnocchi pesto", "gnocchi"],
    "beef-massaman-curry": ["massaman curry"],
    "honey-soy-chicken-traybake": ["glazed chicken thighs", "roast chicken thighs", "soy sauce chicken"],
    "halloumi-grain-bowl": ["halloumi bowl", "grain bowl", "grilled halloumi"],
    "prawn-garlic-spaghetti": ["shrimp spaghetti", "prawn pasta", "spaghetti prawns"],
    "veggie-chilli": ["vegetarian chili", "chili sin carne", "bean chili"],
    "salmon-teriyaki-soba": ["salmon soba", "teriyaki salmon", "soba noodles dish"],
    "french-onion-soup": ["french onion soup"],
    "chicken-schnitzel": ["chicken schnitzel", "schnitzel"],
    "tofu-red-curry": ["red curry tofu", "thai red curry"],
    "bibimbap": ["bibimbap"],
    "ploughmans-lunch": ["ploughman's lunch", "ploughmans lunch", "cheese pickle lunch plate"],
    "fish-and-chips": ["fish and chips"],
    "beef-birria-tacos": ["birria tacos", "birria"],
    "chicken-biryani": ["chicken biryani", "biryani"],
    "tonkotsu-ramen": ["tonkotsu ramen", "ramen bowl"],
    "sweet-and-sour-pork": ["sweet and sour pork"],
    "spicy-tuna-rolls": ["tuna roll sushi", "spicy tuna roll", "maki rolls"],
    "banh-xeo": ["banh xeo"],
    "char-siu-rice": ["char siu rice", "char siu"],
    "buffalo-wings": ["buffalo wings", "chicken wings"],
    "mortadella-focaccia": ["mortadella sandwich", "focaccia sandwich", "mortadella"],
    "nasi-goreng": ["nasi goreng"],
    "pad-kra-pao": ["pad kra pao", "phat kaphrao", "thai basil chicken rice"],
    "jerk-chicken-rice": ["jerk chicken", "jerk chicken rice"],
    "pork-dumplings": ["pork dumplings", "jiaozi", "steamed dumplings"],
    "fish-ceviche": ["ceviche"],
    "lamb-pide": ["lamb pide", "pide", "turkish pide"],
}


def deck_ids() -> list[str]:
    source = DECK_FILE.read_text(encoding="utf-8")
    return re.findall(r"id:\s*['\"]([a-z0-9-]+)['\"]", source)


def strip_html(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value)).strip()


def search_commons(query: str, limit: int) -> list[dict]:
    params = {
        "action": "query",
        "generator": "search",
        "gsrsearch": f"{query} filetype:bitmap",
        "gsrnamespace": 6,
        "gsrlimit": limit,
        "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": THUMB_WIDTH,
        "format": "json",
        "formatversion": 2,
    }
    response = requests.get(API, params=params, headers=HEADERS, timeout=30)
    response.raise_for_status()
    pages = response.json().get("query", {}).get("pages", [])
    return sorted(pages, key=lambda p: p.get("index", 999))


def candidate_from_page(page: dict) -> dict | None:
    infos = page.get("imageinfo") or []
    if not infos:
        return None
    info = infos[0]
    if info.get("mime") not in {"image/jpeg", "image/png"}:
        return None
    width, height = info.get("width", 0), info.get("height", 0)
    if min(width, height) < MIN_SIDE:
        return None
    aspect = width / height if height else 0
    if not (ASPECT_RANGE[0] <= aspect <= ASPECT_RANGE[1]):
        return None

    meta = info.get("extmetadata", {})
    def field(name: str) -> str:
        return strip_html(str(meta.get(name, {}).get("value", "")))

    screen = " ".join([page.get("title", ""), field("Categories"), field("ImageDescription"), field("ObjectName")])
    if REJECT.search(screen):
        return None

    return {
        "title": page["title"],
        "thumb_url": info.get("thumburl") or info["url"],
        "source_url": info.get("descriptionurl", ""),
        "author": field("Artist") or "unknown",
        "license": field("LicenseShortName") or "unknown",
        "width": width,
        "height": height,
    }


def gather_candidates(dish_id: str, per_dish: int) -> list[dict]:
    seen: set[str] = set()
    found: list[dict] = []
    for query in QUERIES.get(dish_id, [dish_id.replace("-", " ")]):
        for page in search_commons(query, limit=per_dish * 3):
            candidate = candidate_from_page(page)
            if candidate is None or candidate["title"] in seen:
                continue
            seen.add(candidate["title"])
            found.append(candidate)
            if len(found) >= per_dish:
                return found
        time.sleep(0.3)
    return found


def download(url: str, dest: Path) -> None:
    for attempt in range(4):
        response = requests.get(url, headers=HEADERS, timeout=60)
        if response.status_code == 429 and attempt < 3:   # Commons rate limiter — back off and retry
            time.sleep(5 * (attempt + 1))
            continue
        response.raise_for_status()
        dest.write_bytes(response.content)
        return


def build_sheets(candidates: dict[str, list[dict]], out_dir: Path, thumbs_dir: Path, per_dish: int) -> None:
    tile, label_h, rows_per_sheet = 300, 26, 6
    sheets_dir = out_dir / "sheets"
    sheets_dir.mkdir(parents=True, exist_ok=True)
    ids = [i for i in candidates if candidates[i]]

    for sheet_no, start in enumerate(range(0, len(ids), rows_per_sheet)):
        chunk = ids[start:start + rows_per_sheet]
        sheet = Image.new("RGB", (tile * per_dish, (tile + label_h) * len(chunk)), "#202020")
        draw = ImageDraw.Draw(sheet)
        for row, dish_id in enumerate(chunk):
            y0 = row * (tile + label_h)
            for col, cand in enumerate(candidates[dish_id]):
                thumb_path = thumbs_dir / dish_id / f"{col}.jpg"
                if not thumb_path.exists():
                    continue
                with Image.open(thumb_path) as img:
                    img = img.convert("RGB")
                    img.thumbnail((tile, tile))
                    sheet.paste(img, (col * tile + (tile - img.width) // 2, y0 + label_h + (tile - img.height) // 2))
                draw.text((col * tile + 6, y0 + 6), f"{dish_id} · {col}", fill="#FFFFFF")
        sheet_path = sheets_dir / f"sheet-{sheet_no}.jpg"
        sheet.save(sheet_path, "JPEG", quality=80)
        print(f"sheet: {sheet_path}")


def cmd_candidates(args: argparse.Namespace) -> int:
    out_dir = Path(args.out)
    thumbs_dir = out_dir / "thumbs"
    only = set(args.ids.split(",")) if args.ids else None

    missing = [i for i in deck_ids() if not (OUT_DIR / f"{i}.jpg").exists() and not any(
        (RAW_DIR / f"{i}{ext}").exists() for ext in (".jpg", ".jpeg", ".png", ".webp"))]
    if only is not None:
        missing = [i for i in missing if i in only]
    print(f"sourcing candidates for {len(missing)} dishes")

    # Merge with any prior run so partial re-runs (e.g. after rate limiting) don't
    # erase already-gathered dishes from the metadata or the sheets.
    try:
        all_candidates: dict[str, list[dict]] = json.loads((out_dir / "candidates.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        all_candidates = {}
    for dish_id in missing:
        try:
            found = gather_candidates(dish_id, args.per_dish)
        except requests.RequestException as error:
            print(f"fail: {dish_id}: search: {error}", file=sys.stderr)
            found = []
        kept = []
        for cand in found:
            # Named by kept-index so sheet tiles always match candidates.json positions.
            dest = thumbs_dir / dish_id / f"{len(kept)}.jpg"
            dest.parent.mkdir(parents=True, exist_ok=True)
            try:
                download(cand["thumb_url"], dest)
                kept.append(cand)
                time.sleep(0.5)
            except requests.RequestException as error:
                print(f"fail: {dish_id}[{cand['title']}]: download: {error}", file=sys.stderr)
        all_candidates[dish_id] = kept
        print(f"{'ok' if kept else 'NONE'}: {dish_id} ({len(kept)} candidates)")
        time.sleep(0.5)

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "candidates.json").write_text(json.dumps(all_candidates, indent=2) + "\n", encoding="utf-8")
    build_sheets(all_candidates, out_dir, thumbs_dir, args.per_dish)
    empty = [i for i, c in all_candidates.items() if not c]
    if empty:
        print(f"\nno candidates found for: {', '.join(empty)}")
    return 0


def cmd_finalize(args: argparse.Namespace) -> int:
    out_dir = Path(args.out)
    candidates = json.loads((out_dir / "candidates.json").read_text(encoding="utf-8"))
    selections = json.loads(Path(args.selections).read_text(encoding="utf-8"))

    try:
        credits = json.loads(CREDITS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        credits = {}

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    saved = skipped = failed = 0
    for dish_id, choice in selections.items():
        if choice is None:
            skipped += 1
            continue
        try:
            cand = candidates[dish_id][choice]
        except (KeyError, IndexError):
            print(f"fail: {dish_id}: no candidate #{choice}", file=sys.stderr)
            failed += 1
            continue
        # Re-resolve at FULL_WIDTH — the stored thumb is review-sized.
        params = {
            "action": "query", "titles": cand["title"], "prop": "imageinfo",
            "iiprop": "url", "iiurlwidth": FULL_WIDTH, "format": "json", "formatversion": 2,
        }
        try:
            response = requests.get(API, params=params, headers=HEADERS, timeout=30)
            response.raise_for_status()
            info = response.json()["query"]["pages"][0]["imageinfo"][0]
            download(info.get("thumburl") or info["url"], RAW_DIR / f"{dish_id}.jpg")
        except (requests.RequestException, KeyError, IndexError) as error:
            print(f"fail: {dish_id}: {error}", file=sys.stderr)
            failed += 1
            continue
        credits[dish_id] = {
            "title": cand["title"].removeprefix("File:"),
            "author": cand["author"],
            "license": cand["license"],
            "source": cand["source_url"],
        }
        saved += 1
        print(f"ok: {dish_id} <- {cand['title']} ({cand['license']})")
        time.sleep(0.3)

    CREDITS_FILE.write_text(json.dumps(dict(sorted(credits.items())), indent=4) + "\n", encoding="utf-8")
    print(f"\nsaved {saved} raw images · skipped {skipped} · failed {failed}")
    print("next: python scripts/standardise_images.py")
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    cand = sub.add_parser("candidates", help="search + download review candidates")
    cand.add_argument("--out", required=True, help="working directory for thumbs/sheets/metadata")
    cand.add_argument("--ids", default=None, help="comma-separated dish ids (default: all missing)")
    cand.add_argument("--per-dish", type=int, default=5)
    cand.set_defaults(func=cmd_candidates)

    fin = sub.add_parser("finalize", help="download selected picks into raw_images/")
    fin.add_argument("--out", required=True, help="working directory used by `candidates`")
    fin.add_argument("--selections", required=True, help="JSON file: {dish_id: index|null}")
    fin.set_defaults(func=cmd_finalize)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
