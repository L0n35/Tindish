# Image sourcing guide

Tindish ships with **zero photos** and looks designed without them (deterministic gradient
cards). Photos are an upgrade, sourced once, on your schedule. **No AI-generated imagery,
ever** — real photography only.

## 1. Style spec

- **One photographer's overhead flat-lay series.** Consistency beats individual beauty:
  same lighting, same plate era, same perspective across the whole deck.
- **90° overhead only.** No 45° hero shots, no close crops — the pipeline cuts the dish
  out and recomposes it, and mixed perspectives read as clutter on the card stack.
- Subject should fill roughly 60–80% of the frame, on any background (it gets removed).
- Natural, soft light preferred; avoid heavy props that overlap the dish.

## 2. Sources

Two paths — they compose (automated first, upgrade selectively):

- **Automated (free): `scripts/source_images.py`** pulls openly-licensed real photos
  from Wikimedia Commons. Coverage over consistency: photos come from many
  photographers, so the style spec above won't be met — but every dish gets real
  card art in minutes, and any individual photo can be replaced later by dropping a
  better file into `raw_images/` and re-running the pipeline. Candidates whose
  metadata mentions AI generation are rejected automatically; a human (or Claude)
  still eyeballs contact sheets before anything is committed. Attribution for every
  sourced photo is recorded in `public/images/credits.json` (committed — CC BY /
  CC BY-SA require it).

  ```bash
  # 1. gather candidates + contact sheets for every dish without a photo
  python scripts/source_images.py candidates --out /tmp/sourcing
  # 2. review /tmp/sourcing/sheets/*.jpg, write selections {id: index|null}
  # 3. download the picks into raw_images/ and record credits
  python scripts/source_images.py finalize --out /tmp/sourcing --selections picks.json
  python scripts/standardise_images.py
  ```

- **Manual (paid, prettier): Envato Elements** or **Adobe Stock**. Find one
  photographer whose food series you like, then filter by their author page — most
  flat-lay food photographers shoot in consistent multi-dish series, which is exactly
  what the deck needs. Use this to selectively replace the weakest automated picks.

## 3. Licensing note

Standard Envato Elements / Adobe Stock licences cover this personal, private deployment.
Two rules regardless of source:

- `raw_images/` (the licensed originals) is **gitignored** — stock licences generally
  prohibit redistributing source files. Keep originals in your own backup.
- The committed processed derivatives (`public/images/dishes/*.jpg`) exist solely for
  this private two-user app. Re-check licence terms before making the repo public.

## 4. Workflow — trial before you bulk-source

1. **Pick 6–8 dishes** from the list below (spread across cuisines and formats).
2. Download, rename each file to its dish id (e.g. `beef-pho.jpg`), drop into `raw_images/`.
3. `pip install -r scripts/requirements.txt` (once), then `python scripts/standardise_images.py`.
4. Eyeball the results in `public/images/dishes/` — cutout quality, centring, backdrop blend
   (`#EDE7DD` matches the card face exactly, so photos sit seamlessly on the cards).
5. Run the app — manifest updates automatically; only listed ids ever load photos.
6. Only when the trial pleases you: source the rest and re-run the script.

## 5. Pipeline usage

```bash
python scripts/standardise_images.py                 # process anything new or changed
python scripts/standardise_images.py --force         # reprocess everything
python scripts/standardise_images.py --only beef-pho,katsu-sando
python scripts/standardise_images.py --backdrop "#EDE7DD" --size 1024 --scale 0.75
```

- Re-processing detection: input + config hashes live in `scripts/.image-cache.json`
  (committed — cache state travels with the committed outputs). The runtime manifest
  (`public/images/manifest.json`) is rebuilt from the output directory every run and
  never carries bookkeeping.
- Removing a photo: delete `public/images/dishes/{id}.jpg`, re-run the script; the
  manifest self-heals and the app falls back to the gradient card. Zero 404s either way.

## 6. Shopping list

The canonical per-dish search list now lives in `QUERIES` inside
`scripts/source_images.py` — it covers every deck id and is what the automated path
uses. When adding a dish to `deck.ts`, add a matching `QUERIES` entry. The table
below is kept for the original starter deck's stock-site phrasing (useful when
manually sourcing on Envato/Adobe, whose search behaves differently to Commons).

| id | name | search terms |
|---|---|---|
| chicken-pad-thai | Chicken pad thai | pad thai overhead, thai noodles flat lay |
| beef-pho | Beef pho | pho bowl overhead, vietnamese noodle soup top view |
| margherita-pizza | Margherita pizza | margherita pizza overhead, neapolitan pizza flat lay |
| chicken-tikka-masala | Chicken tikka masala | tikka masala overhead, indian curry bowl top |
| pork-banh-mi | Pork bánh mì | banh mi sandwich overhead, vietnamese baguette |
| chicken-burrito | Chicken burrito | burrito overhead, wrapped burrito flat lay |
| salmon-poke-bowl | Salmon poke bowl | poke bowl overhead, salmon rice bowl top view |
| lamb-souvlaki | Lamb souvlaki | lamb skewers overhead, souvlaki flat lay |
| pad-see-ew | Pad see ew | pad see ew overhead, thai flat noodles |
| chicken-katsu-curry | Chicken katsu curry | katsu curry overhead, japanese curry rice |
| beef-bulgogi-bowl | Beef bulgogi bowl | bulgogi bowl overhead, korean beef rice bowl |
| falafel-wrap | Falafel wrap | falafel wrap overhead, pita falafel flat lay |
| chicken-caesar-salad | Chicken caesar salad | caesar salad overhead, chicken salad top view |
| prawn-laksa | Prawn laksa | laksa overhead, malaysian curry noodle soup |
| katsu-sando | Katsu sando | katsu sandwich overhead, japanese pork sandwich |
| greek-halloumi-salad | Greek salad with halloumi | greek salad overhead, halloumi salad flat lay |
| mushroom-risotto | Mushroom risotto | risotto overhead, mushroom risotto plate top |
| beef-ragu-tagliatelle | Beef ragù tagliatelle | tagliatelle ragu overhead, pasta bolognese flat lay |
| thai-green-curry | Thai green curry | green curry overhead, thai curry bowl top |
| roast-chicken-club | Roast chicken club sandwich | club sandwich overhead, chicken sandwich stack |
| courgette-lemon-linguine | Courgette & lemon linguine | zucchini pasta overhead, lemon linguine flat lay |
| vietnamese-noodle-salad | Vietnamese noodle salad | bun noodle salad overhead, vermicelli bowl top |
| baja-fish-tacos | Baja fish tacos | fish tacos overhead, baja tacos flat lay |
| herby-chicken-couscous | Herby chicken couscous | couscous chicken overhead, couscous bowl flat lay |
| burrata-tomato-plate | Burrata with tomatoes & focaccia | burrata plate overhead, burrata tomatoes flat lay |
| truffle-mac-cheese | Truffle mac & cheese | mac and cheese overhead, baked macaroni top view |
| steak-frites | Steak frites | steak frites overhead, steak and fries flat lay |
| pork-belly-bao | Pork belly bao buns | bao buns overhead, steamed buns flat lay |
| chicken-quinoa-tabbouleh | Chicken quinoa tabbouleh | quinoa tabbouleh overhead, grain salad top view |
| miso-salmon-greens | Miso salmon with greens | miso salmon overhead, salmon greens plate top |
| chicken-veg-stir-fry | Chicken & veg stir-fry | chicken stir fry overhead, wok noodles flat lay |
| tarka-dal | Tarka dal with rice | dal overhead, lentil curry rice top view |
| crispy-beef-chow-mein | Crispy beef chow mein | chow mein overhead, crispy noodles flat lay |
| korean-fried-chicken | Korean fried chicken | korean fried chicken overhead, glazed chicken flat lay |
| lamb-doner-kebab | Lamb doner kebab | doner kebab overhead, kebab wrap flat lay |
| pastrami-deli-sub | Pastrami deli sub | pastrami sandwich overhead, deli sub flat lay |
| prawn-summer-rolls | Prawn summer rolls | summer rolls overhead, rice paper rolls flat lay |
| chicken-shawarma-plate | Chicken shawarma plate | shawarma plate overhead, chicken shawarma flat lay |
| mezze-plate | Mezze plate | mezze platter overhead, hummus platter flat lay |
| salmon-sushi-platter | Salmon sushi platter | sushi platter overhead, salmon sushi flat lay |
| pepperoni-pizza | Pepperoni pizza | pepperoni pizza overhead, pizza flat lay |
| butter-chicken-naan | Butter chicken with naan | butter chicken overhead, curry naan flat lay |
| double-smash-burger | Double smash burger | smash burger overhead, cheeseburger flat lay |
| chirashi-bowl | Chirashi bowl | chirashi overhead, sashimi rice bowl top view |
| crispy-duck-pancakes | Crispy duck pancakes | duck pancakes overhead, peking duck flat lay |
| piri-piri-chicken | Piri piri chicken | piri piri chicken overhead, grilled chicken flat lay |
| falafel-buddha-bowl | Falafel buddha bowl | buddha bowl overhead, falafel bowl flat lay |
| tom-yum-prawn-soup | Tom yum prawn soup | tom yum overhead, thai prawn soup top view |
