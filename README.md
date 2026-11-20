# 📜 Loreforge

A free, private worldbuilding and campaign manager for game masters and storytellers. It runs entirely in your browser: no account, no server, no subscription.

It combines a **world wiki** (entries, maps, relationship graphs, a shareable player wiki) with **GM campaign tools** (arcs, sessions with beats, a custom calendar timeline and journals).

## Features

**World Bible.** Entries for characters, locations, factions, items, creatures and lore, each colour-coded. Every entry has a summary, custom detail fields, tags, an image, a long description and a 🔒 GM-secrets section.

**@links everywhere.** Type `@` in any text box to link an entry, or create one on the spot. Entries automatically show what they link to and everywhere they're mentioned.

**Interactive maps.** Upload any map image, then pan and zoom. Drop pins linked to entries, nest maps (a pin on the world map can open a city map, which opens a dungeon map), calibrate the scale against the map's scale bar, and measure routes with travel times on foot, horseback, wagon and ship.

**Relationship graph.** A live, draggable web of your world built from named relationships ("rules", "ally of"…) and @mentions. Filter by type.

**Campaigns and sessions.** Group sessions into arcs. Plan each session as a checklist of beats you tick off at the table, with prep notes, a recap, and an auto-generated list of the NPCs and places featured.

**Timeline and custom calendar.** Set your own months, day counts, weekdays and eras. World events and dated sessions appear on one timeline, with a month calendar view.

**Journals.** Long-form writing for session logs, history, handouts and house rules.

**Side panel.** Ctrl+click (⌘+click on Mac) any link to open it beside what you're working on.

**Search.** Ctrl+K searches everything.

**Player wiki export.** One self-contained HTML file with entries, maps, timeline and history/handout journals. GM secrets and session prep are left out.

**Backups.** Export and import your whole world as a `.json` file, which is also how you move it to another computer.

**Accessibility.** Adjustable text size, an easy-read font (Atkinson Hyperlegible) and a light parchment theme.

## Using it

Open the GitHub Pages link for this repository, then choose **Try a sample world** to see everything working together, or **New world** to start fresh.

> ⚠️ Your worlds are stored in your browser (IndexedDB). Clearing site data deletes them, so use **World settings → Export backup** regularly.

## Running locally

It's plain HTML, CSS and JavaScript, so there's no build step:

```bash
git clone https://github.com/luxswilli4m/loreforge.git
cd loreforge
python3 -m http.server 8000   # then open http://localhost:8000
```

(It must be served over http rather than opened as a file, because it uses ES modules.)

## Project structure

```
index.html
css/style.css
js/
  app.js          router, side panel, search
  store.js        data model, calendar maths, import/export
  db.js           IndexedDB storage
  util.js         markdown, @mention editor, dialogs
  sample.js       demo world
  views/          home, entries, maps, graph, campaign, timeline, journals, settings
```

Inspired by the ideas behind tools like World Anvil, vvd and ScribesBlade. This is an independent open-source project.
