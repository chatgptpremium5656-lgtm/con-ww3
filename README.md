# Conflict of Nations: World War 3 — fan recreation (experiment)

Single-file browser grand-strategy game, written from scratch, inspired by *Conflict of Nations: World War 3*.
Open **`index.html`** in any modern browser (no server, no dependencies). Everything — map, engine, AI and UI — is inside that one file.

## Quick play — version 0.4.0

New games now start in the simpler mode: three visible resources (money, materials,
manpower), three sidebar sections, a short menu, and compact recruitment panels.
Food, fuel and supply are managed automatically; fatigue, weather penalties,
taxation and civilian decisions are removed from the default game loop.
Units cost less and take about 40% of the previous recruitment time; construction
takes half the time, movement is 60% faster, and manpower recovers three times faster.
Income and materials production are boosted by 50%. Armies upgrade automatically
each week. The default victory target is 25% of world points with your alliance.

Cruise, ballistic and nuclear missiles are disabled for **all** countries in both
modes. Old saves are migrated: missiles on bases and in flight are removed, queued
missiles are refunded, and silos become income buildings. Missile research and launch
controls are unavailable. Definitions remain in the loader solely for compatibility.

The optional advanced mode is under additional settings on the start screen. The
0.3.0 campaign systems described below apply to that mode; they are not presented as
extra management chores in quick play. Existing saves remain loadable.

## Features
* Real-time world map (Natural Earth based): 197 countries, 755 provinces around real cities, 98 sea zones, terrain, victory points.
* Economy: 7 resources + manpower, daily production, upkeep, shortages, world market.
* Provinces with 10 building types; production queues for conventional land, air and naval units in 4 tech generations.
* Optional advanced research (unit generations + national techs), 5 parallel branches.
* Real-time combat with terrain, armour, morale, retreats, AA fire, bombing, submarines (stealth), carriers, transports & amphibious landings.
* Province capture, occupation, capitals, country elimination, victory points & alliance victory.
* Diplomacy: war / peace, alliances (NATO, CSTO, Pacific pact, Beijing union, Arab coalition…), military access, gifts, relations.
* AI for every country: economy, production, research, diplomacy, land, air and naval warfare.
* Fog of war, map layers (political, terrain, relations, alliances, population, power, resources), minimap, save/load, autosave, sounds.
* Score + world ranking, in-game objectives with rewards, day/night cycle, unit upgrades, cyber attacks.
* Touch support (pinch, long-press = order), responsive layout.

## Controls
| Action | Mouse | Touch |
| --- | --- | --- |
| Select | LMB on a unit chip / province | tap |
| Order | RMB on target (or buttons *Идти / Удар / Патруль / Пуск*) | long-press |
| Box select | Shift + drag | — |
| Pan / Zoom | drag / wheel | drag / pinch |
| Pause / speed | `Space` / `1`–`5` | top bar |

## Building from source
```
NOMIN=1 node tools/build.js       # deterministic standalone index.html, no npm dependencies
node --test tools/campaign.test.js
node tools/sim.js 60 POL          # 60-day simulation including save/load
```
Use Node.js 24 and Git for the tests (the migration test reads the previous committed engine).
The checked-in `src/world.js` is sufficient for normal development. Optional world regeneration:
`node tools/build_world.js`. This requires Natural Earth 1:50m `admin_0_countries` and
`populated_places` GeoJSON (public domain) in `tools/data/` and overwrites `src/world.js`.

Optional browser checks (Python 3.12):

```
python -m pip install -r requirements-dev.txt
python -m playwright install --with-deps chromium
python tools/browser_smoke.py
```

The browser runner starts its own temporary HTTP server and checks the actual bundled game,
all headquarters tabs, tax changes, city search, remapped controls, downloaded saves,
file import, invalid-file recovery, and the mobile layout. Set `CHROMIUM_EXECUTABLE` to
select a local Chromium binary. `.github/workflows/checks.yml` runs these checks on pushes
and pull requests and verifies that the committed bundle matches the sources.

## Campaign update 0.3.0

Open **🎛 Штаб** or **💡 Что делать дальше?** during a game. The headquarters includes:

* A contextual advisor, a searchable handbook, and unit comparisons.
* A seven-day budget, resource history, tax policy, configurable auto-purchasing, fuel reserves,
  emergency money issuance, loyalty, civilian aid, and population growth.
* Supply through friendly territory from capitals, depots and unblocked ports; isolation penalties,
  experience, fatigue, entrenchment, attack/defence/ambush stances and safe repair orders.
* Named groups, waypoint orders (Shift + right click), production templates, and queue priorities.
* Non-aggression pacts, guarantees, bilateral trade, embargoes, allied loans and peace terms.
* Battle reports, a campaign journal, achievements and local personal records.
* Sandbox, spectator and realism modes; fixed seeds, stock multipliers and separate AI aggression.
* Light/dark/military themes, font size, contrast, reduced effects, sound volume, optional procedural
  music, rebindable physical keys, and a low-power mode for phones.
* Portable JSON saves with schema validation, version-one migration, and deterministic resumption.

Search accepts country names/keys, cities, own unit types/IDs, and saved map markers.
Ctrl + 1–9 saves selected groups; Alt + 1–9 recalls them. In screenshot mode, Esc restores the HUD.
Optional waves, clouds, city lights, infrastructure links, range circles and resource icons can be
switched off. The infrastructure overlay represents game graph connections, not a geographic
railway dataset.

Save files are **local files**, achievements belong to the current campaign, and records are stored
in the current browser. Cloud saves, online rankings, multiplayer and complete replays are not
implemented. GitHub Pages provides static hosting only.

See [the detailed improvement matrix](docs/IMPROVEMENTS.md) for completed, partial and outstanding
items from the requested lists. This update does not claim all 100 proposals are complete.
