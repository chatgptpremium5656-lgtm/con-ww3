# Conflict of Nations: World War 3 — fan recreation (experiment)

Single-file browser grand-strategy game, written from scratch, inspired by *Conflict of Nations: World War 3*.
Open **`index.html`** in any modern browser (no server, no dependencies). Everything — map, engine, AI and UI — is inside that one file.

## Features
* Real-time world map (Natural Earth based): 197 countries, 755 provinces around real cities, 98 sea zones, terrain, victory points.
* Economy: 7 resources + manpower, daily production, upkeep, shortages, world market.
* Provinces with 10 building types; production queues for 22 unit types (land / air / sea / missiles / nukes) in 4 tech generations.
* Research tree (unit generations + national techs), 5 parallel branches.
* Real-time combat with terrain, armour, morale, retreats, AA fire, bombing, submarines (stealth), carriers, transports & amphibious landings.
* Province capture, occupation, capitals, country elimination, victory points & alliance victory.
* Diplomacy: war / peace, alliances (NATO, CSTO, Pacific pact, Beijing union, Arab coalition…), military access, gifts, relations.
* AI for every country: economy, production, research, diplomacy, land/air/naval/missile warfare, nuclear doctrine.
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
node tools/build_world.js   # needs tools/data/*.geojson from Natural Earth (see below) -> src/world.js
node tools/build.js         # bundles src/* into index.html
node tools/sim.js 60 POL    # headless simulation smoke test
```
Natural Earth 1:50m `admin_0_countries` and `populated_places` GeoJSON (public domain) go in `tools/data/`.
