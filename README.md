# Pokemon Go Lucky Shiny Tracker

A Google Apps Script web app for tracking Lucky Shiny Pokemon collection progress across multiple players. Built on Google Sheets as a backend, with a mobile-friendly dark-themed SPA frontend.

## Overview

This tool helps groups of Pokemon Go friends track which Lucky Shiny Pokemon each person has collected. It syncs the full Pokemon Go Pokedex from [pokemondb.net](https://pokemondb.net/go/pokedex), tracks completion status and priority for each player, generates in-game search strings for trading sessions, and provides visual overviews of collection progress.

## Features

### Tracker Tab (Main)
- **Mark as Done** — Search for a Pokemon by name or dex number. Mark a single Pokemon ("Only") or an entire evolution line ("Line") as collected. Evolution chains are fetched from [pokemondb.net/evolution](https://pokemondb.net/evolution) and displayed as previews under each dropdown item.
- **Mark as Priority** — Identical to Mark as Done, but flags a Pokemon as high-priority (for Pokemon that are Done but you still want extras of). Priority is stored as `x` in a separate column.
- **Stats Bar** — Shows Need / Done / Priority counts for the active player (excludes Mega/Primal).
- **Search Strings** — Pre-generated per-player search strings for use in Pokemon Go's search bar. Includes all Pokemon the player still needs. Each player has a "Priority" checkbox that, when enabled, also includes Done Pokemon marked as priority. Click any string to copy to clipboard.
- **Transfer Strings** — Per-player transfer strings that include Pokemon where ALL other players already have it Done. Useful for identifying safe transfers. Includes:
  - Keyword filter checkboxes (costume, shadow, xxl, xxs, dynamax, background) — each adds a `!keyword` exclusion
  - Per-player priority checkboxes — when checked, excludes Pokemon that another player has marked as priority
  - Static prefix: `!traded&!shiny&!4*&!mythical&!#&`

### Mega Tab
- Separate tracker for Mega and Primal evolutions (excluded from the main Tracker tab)
- Table layout with one row per Mega/Primal Pokemon and one checkbox column per player
- Check/uncheck to toggle Done status — persisted to the MegaPoke sheet immediately
- No priority system for Megas (just Done or not)

### Forms Tab
- Tile-based view showing only Pokemon that have multiple forms or regional variants (excludes Megas)
- Each tile shows the Pokemon sprite, name, dex number, and a colored status dot per player
- Filter buttons: All / Need / Done / Priority (relative to the active player)
- Useful for tracking progress on regional variants (Alolan, Galarian, Hisuian, Paldean), gender forms (Pyroar Male/Female), color forms (Flabebe flower colors), etc.

### Overview Tab
- Tile-based view of ALL Pokemon (main + mega combined), sorted by dex number
- Each tile displays:
  - Pokemon GO sprite from pokemondb.net
  - Pokemon name (including form/variant name)
  - Dex number
  - Colored status dot per player: green = Done, yellow = Priority, red = Need
- Legend/key at the top of the page
- Filter buttons: All / Need / Done / Priority (relative to the active player)
- Megas show Done/Need only (no priority)

### Import / Export
- Accessible via the gear icon in the header
- **Export**: Select a player, generates a compact JSON blob containing only Pokemon with a status or priority set (from both main and mega sheets). Click Copy to send to clipboard.
- **Import**: Select a target player, paste a JSON export string, click Import. Matches Pokemon by dex number + name and writes statuses. Useful for transferring data between separate tracker instances.

### Pokedex Sync
- Fetches the full Pokemon Go Pokedex from pokemondb.net
- Parses all Pokemon entries including forms, regional variants, and Mega/Primal evolutions
- Adds new Pokemon to the appropriate sheet (main or mega) without affecting existing data
- Sorts by dex number after adding
- Handles form name construction: if a form's sub-name doesn't contain the base name, it prepends it (e.g., "Sunny Form" becomes "Castform Sunny Form")

### Player Management
- Add players via the + button in the header
- Adding a player creates two columns on MainPoke (status + priority) and one column on MegaPoke (status only)
- Player toggle buttons in the header control which player's data is shown in the Tracker tab

## Architecture

### Files

| File | Purpose |
|------|---------|
| `WebApp.gs` | Server-side Google Apps Script: sheet CRUD, pokedex sync, evolution chain fetch, import |
| `Index.html` | Client-side SPA: all HTML, CSS, and JavaScript in a single file |
| `Code.gs` | Legacy file from earlier prototype (not used by the current deployment) |

### Google Sheets Structure

#### MainPoke Sheet
| Column A | Column B | Column C | Column D | Column E | Column F | ... |
|----------|----------|----------|----------|----------|----------|-----|
| Number | Name | Player1 | Player1 Priority | Player2 | Player2 Priority | ... |
| 1 | Bulbasaur | Done | | Done | x | ... |
| 1 | Bulbasaur | | | Done | | ... |

- Columns A-B: Dex number and Pokemon name (including form name)
- Player columns come in pairs: status column ("Done" or empty) + priority column ("x" or empty)
- Sorted by dex number (ascending), then name (ascending)

#### MegaPoke Sheet
| Column A | Column B | Column C | Column D | ... |
|----------|----------|----------|----------|-----|
| Number | Name | Player1 | Player2 | ... |
| 3 | Mega Venusaur | Done | | ... |

- Columns A-B: Dex number and Mega/Primal name
- One column per player (status only, no priority)
- Auto-created if it doesn't exist
- Player columns are auto-synced from the main sheet when `getMegaData()` runs

### Data Flow

```
pokemondb.net/go/pokedex ──(sync)──> Google Sheet (MainPoke + MegaPoke)
pokemondb.net/evolution ──(fetch)──> Evolution chains (in-memory, per session)
Google Sheet ──(getSheetData/getMegaData)──> Client JS (allPokemon, megaPokemon)
Client JS ──(mark/unmark calls)──> Google Sheet (cell updates)
Client JS ──(local computation)──> Search strings, transfer strings, stats, tiles
```

- All data loads happen on page init via `google.script.run`
- Search strings and transfer strings are computed client-side from loaded data (no server round-trip)
- Mark as Done/Priority makes a server call, then updates the local data optimistically
- Evolution chains are fetched once per page load from pokemondb.net/evolution

## Configuration

All configuration is at the top of `WebApp.gs`:

```javascript
var SPREADSHEET_ID = '...';        // Google Sheet ID
var SHEET_NAME = 'MainPoke';       // Main tracker tab name
var MEGA_SHEET_NAME = 'MegaPoke';  // Mega tracker tab name
var POKEDEX_URL = 'https://pokemondb.net/go/pokedex';
var EVOLUTION_URL = 'https://pokemondb.net/evolution';
```

### Form Filters

These variables control which Pokemon forms are included in the MainPoke sheet during sync:

```javascript
var INCLUDE_BASE = true;              // Base forms (first occurrence of each dex number)
var INCLUDE_MEGA_PRIMAL = false;      // Mega/Primal go to MegaPoke instead
var INCLUDE_REGIONAL = true;          // Regional variants
var REGIONAL_PREFIXES = ['Alolan', 'Galarian', 'Hisuian', 'Paldean'];
var BREED_KEYWORDS = ['Breed'];       // Matches Tauros breed variants
var EXCLUDE_NAMES = ['Armored Mewtwo']; // Specific exclusions
```

**Form inclusion logic:**
1. Check exclusion list first
2. Mega/Primal forms are routed to the mega sheet (or included in main if `INCLUDE_MEGA_PRIMAL = true`)
3. Regional variants are identified by prefix (Alolan, Galarian, etc.) or breed keyword
4. Base forms (first occurrence of a dex number) are always included when `INCLUDE_BASE = true`
5. Non-base forms of Pokemon with multiple forms (e.g., Pyroar Female, Flabebe colors) are included alongside their base form

## Setup

### Prerequisites
- A Google account
- A Google Sheet (can be empty — the app will create headers and sheets as needed)

### Installation

1. **Create the Google Sheet**
   - Create a new Google Sheet
   - Note the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`

2. **Create the Apps Script Project**
   - Go to [script.google.com](https://script.google.com) and create a new project
   - Or from the Google Sheet: Extensions > Apps Script
   - Delete any default code in `Code.gs`

3. **Add the Files**
   - Create a file called `WebApp.gs` and paste the contents
   - Create a file called `Index.html` and paste the contents
   - Update `SPREADSHEET_ID` in `WebApp.gs` with your Sheet ID

4. **Deploy**
   - Click Deploy > New deployment
   - Type: Web app
   - Execute as: Me
   - Who has access: Anyone (or Anyone with link)
   - Click Deploy
   - Authorize the app when prompted
   - Copy the deployment URL

5. **First Use**
   - Open the deployment URL
   - Click **+** to add your first player
   - Click **&#x21bb;** to sync the Pokedex (fetches all Pokemon from pokemondb.net)
   - Start tracking!

### Updating After Code Changes

Saving code in the Apps Script editor does **not** update the deployed web app. You must:

1. Click Deploy > Manage deployments
2. Click the pencil icon on your deployment
3. Change Version to "New version"
4. Click Deploy

### Troubleshooting

| Issue | Solution |
|-------|----------|
| App loads forever / blank page | Make sure you deployed a new version after code changes |
| `openSyncModal is not defined` | Stale deployment — create a new version |
| `getSheetData` calls never complete | Check Apps Script execution log; make sure `openById()` is used (not `getActiveSpreadsheet()`) |
| Multi-account Google issues | Open the app in an incognito window |
| Sync finds 0 Pokemon | The HTML parsing may need updating if pokemondb.net changes their page structure |
| Sprites not loading for some forms | The `getSpriteSlug` function may need a new mapping for that form's URL pattern; sprites fail gracefully (hidden via `onerror`) |

## Sprite URLs

Pokemon sprites are loaded from pokemondb.net's Pokemon GO sprite set:

```
https://img.pokemondb.net/sprites/go/normal/1x/{slug}.png
```

Slug construction rules:
- Base name is lowercased, spaces become hyphens, dots/apostrophes/special chars removed
- Accented characters normalized (e.g., Flabebe not Flabebe)
- Regional prefixes become suffixes: "Alolan Vulpix" -> `vulpix-alolan`
- Mega/Primal become suffixes: "Mega Venusaur" -> `venusaur-mega`
- Form descriptor words stripped: "Red Flower" -> `-red`, "10% Forme" -> `-10`, "Sunny Form" -> `-sunny`
- If a sprite URL fails, the image is hidden gracefully

## Evolution Chains

Evolution chain data is fetched from [pokemondb.net/evolution](https://pokemondb.net/evolution) on each page load. The HTML is parsed by splitting on `infocard-filter-block` divs and extracting `ent-name` anchor text. Names are deduplicated per chain.

The client uses a `getBaseName()` function to strip form prefixes (Mega, Alolan, etc.) before looking up the evolution chain. This allows "Alolan Vulpix" to find the Vulpix -> Ninetales chain.

When marking an evolution "Line" as Done/Priority, all Pokemon in the sheet whose base name appears in the chain are included. This means marking "Bulbasaur Line" as Done will also mark Ivysaur and Venusaur.

## Import / Export Format

The JSON export format:

```json
{
  "player": "PlayerName",
  "main": [
    { "n": "1", "name": "Bulbasaur", "s": "Done" },
    { "n": "25", "name": "Pikachu", "s": "Done", "p": "x" }
  ],
  "mega": [
    { "n": "3", "name": "Mega Venusaur", "s": "Done" }
  ]
}
```

Fields:
- `player` — Player name (informational, not used during import)
- `main` — Array of main sheet entries with status and/or priority
- `mega` — Array of mega sheet entries with status
- `n` — Dex number
- `name` — Full Pokemon name (including form)
- `s` — Status ("Done")
- `p` — Priority ("x")

Only Pokemon with a status or priority set are included in the export. On import, matching is done by `number|name` — unmatched entries are silently skipped.

## Search String Format

Search strings are formatted for Pokemon Go's in-game search bar:

```
!traded&!shadow&!4*&!mythical&1,4,7,10,...
```

- Prefix filters out traded, shadow, 4-star, and mythical Pokemon
- Comma-separated dex numbers for all Pokemon the player still needs
- When the Priority checkbox is enabled, also includes dex numbers of Done Pokemon marked as priority

## Transfer String Format

Transfer strings identify Pokemon safe to transfer:

```
!traded&!shiny&!4*&!mythical&!#&!costume&!shadow&!xxl&!xxs&!dynamax&!background&1,4,7,...
```

- Includes a Pokemon only if ALL other players have it marked as Done
- Keyword filters are togglable checkboxes
- Per-player priority exclusion: when checked, skips Pokemon that another player has as priority
