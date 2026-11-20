# 📜 Loreforge

### ▶ Open the app: **https://luxswilli4m.github.io/loreforge**

A free, private worldbuilding and campaign manager for game masters and storytellers. It runs entirely in your browser: no account, no server, no subscription.

It combines a **world wiki** (entries, maps, relationship graphs, a shareable player wiki) with **GM campaign tools** (arcs, sessions with beats, a custom calendar timeline and journals).

## Features

**World Bible.** Entries for characters, locations, factions, items, creatures and lore, each colour-coded. Every entry has a summary, custom detail fields, tags, an image, a long description and a 🔒 GM-secrets section.

**@links everywhere.** Type `@` in any text box to link an entry, or create one on the spot. Entries automatically show what they link to and everywhere they're mentioned.

**Interactive maps.** Upload any map image, then pan and zoom. Drop pins linked to entries, nest maps (a pin on the world map can open a city map, which opens a dungeon map), calibrate the scale against the map's scale bar, and measure routes with travel times on foot, horseback, wagon and ship.

**GM Screen.** A dice roller that understands rolls like `2d6+3`, `4d6kh3`, `adv` and `dis`, and highlights natural 20s and 1s. An initiative tracker with HP bars, damage and healing, conditions and a round counter; you can add creatures from your World Bible or your whole party at once. A party sheet, quick generators (NPC, tavern, loot, weather, plot hook, names) that save to the World Bible in one click, and your own weighted random tables. Press **D** anywhere for a floating dice tray.

**☁️ Cloud & devices.** You can optionally run your own free server on Cloudflare (see [cloudflare/SETUP.md](cloudflare/SETUP.md)). With it you have one login across all your devices, and worlds, maps and Library files sync automatically. Every device keeps an offline copy. If a world was edited on two devices before they synced, Loreforge asks which version to keep (or keeps both). The server also runs Story Forge's AI using OpenRouter's free models, with Cloudflare Workers AI as a backup, so no keys are stored on your devices.

**🔮 Story Forge.** Ask for a bounty, quest, rumours, NPC, encounter or anything else. Choose where it's set and which factions, religions or lore it should tie into, plus the tone and party level. It reads your world (the location's ruler, its districts, the locals and the factions present) and builds the story around them. Bounties come with a Wanted poster. One click saves the result as a quest, creates the target and quest giver as entries with relationships, and @links everything; you can also save the poster as a player handout. There are two engines:
- *Built-in (free, offline):* a story engine that combines your world's own people, places and faiths with the keywords in your request.
- *AI (optional):* your own Cloudflare server, OpenRouter (free models available), Anthropic Claude, any OpenAI-compatible service, or a local model through Ollama. Your key is stored only in your browser and never included in backups. Requests (with the related parts of your world) go straight from your browser to the provider and are billed to your account.

**Quests.** A drag-and-drop board (Rumoured / Active / Completed / Failed). Each quest has objectives, a quest giver, a reward and details, with @links throughout.

**Library.** Drop in PDF rulebooks, adventures, handouts and images, then read them in the app or Ctrl+click to open them in the side panel next to your notes.

**Undo and milestones.** Ctrl+Z / Ctrl+Y undo and redo anything you've done since opening the app, with fast typing grouped into one step, like Word. Inside a text box, Ctrl+Z works on the text as usual. ⭐ Milestone saves a named, permanent backup whenever you choose, to your GitHub repo, your server, or this device. Restore one from World settings; your current version is kept as a milestone first. Full backups (.json) include pictures and Library files, and you get a reminder when you haven't backed up in two weeks.

**Lightweight worlds.** Pictures and maps are stored as separate files in a compact format and referenced by the world, so worlds stay small and sync quickly. Older worlds convert automatically.

**Little things.** ⭐ Pin favourite entries to the sidebar, 🎲 get name suggestions when creating entries, and press **?** for keyboard shortcuts.

**Map generator.** Create fantasy maps from a seed, in Parchment, Atlas or Night style.
- *World maps:* continents, archipelagos or coastal regions, with mountain ranges, forests, rivers, lakes, biomes, realms and their borders, towns, capitals, roads, and named seas, mountains and forests.
- *City maps:* villages up to capital cities, with walls and gates, districts, building lots, a market square, castle, temple, gardens, a river with bridges, and harbour docks.
- Saving a map can drop pins on every town or landmark and create World Bible entries for towns (Locations) and realms (Factions), linked by relationships. From any pin, "Generate a city map" makes a city that opens from that pin.

**World Web.** A live web of your world built from named, directional connections ("rules", "ally of"…) and @mentions. Right-click a node to connect it to another node (click the target or search for it), create a new connected entry, add a dated note, focus on it, pin it or delete it. Right-click a connection to rename, reverse or delete it, and right-click empty space to add an entry there. Shift+drag from node to node also connects them. Nodes you arrange stay where you put them.

**Encyclopedia.** Every entry, journal, session, map and timeline event in one index. Sort it A–Z (with a letter bar), by category or by tag, filter it, and search it. Articles open in a reading pane, and links inside an article open within the Encyclopedia.

**Appearance.** Five vibes (Tavern, Parchment, Arcane, Verdant, Ember) and torn-paper panels with adjustable tear depth and opacity. By default the background is a freshly generated fantasy map; you can also choose a preset, one of your own maps, or an uploaded image, then darken or soften it.

**Campaigns and sessions.** Group sessions into arcs. Plan each session as a checklist of beats you tick off at the table, with prep notes, a recap, and an auto-generated list of the NPCs and places featured.

**Timeline and custom calendar.** Set your own months, day counts, weekdays and eras. World events and dated sessions appear on one timeline, with a month calendar view.

**Journals.** Long-form writing for session logs, history, handouts and house rules.

**Side panel.** Ctrl+click (⌘+click on Mac) any link to open it beside what you're working on.

**Search.** Ctrl+K searches everything.

**Player wiki export.** One self-contained HTML file with entries, maps, timeline and history/handout journals. GM secrets and session prep are left out.

**Backups.** Export and import your whole world as a `.json` file, which is also how you move it to another computer.

**Accessibility.** Adjustable text size and an easy-read font (Atkinson Hyperlegible).

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

`cloudflare/` holds the optional sync + AI server (`worker.js`) and its setup guide.


```
index.html
css/style.css
js/
  app.js          router, side panel, search
  store.js        data model, calendar maths, import/export
  db.js           IndexedDB storage
  util.js         markdown, @mention editor, dialogs
  sample.js       demo world
  gen/            map generators (core helpers, world.js, city.js, names.js)
  theme.js        themes, torn edges, backgrounds
  cloud.js        sync engine for the Cloudflare server
  assets.js       pictures stored as separate files
  undo.js         session undo / redo
  milestones.js   milestone backups (device / server / GitHub)
  tools/          dice, generators, dice tray, story forge, AI providers
  views/          home, entries, codex, maps, generator, graph, campaign, quests, timeline, journals, gm, forge, library, cloud, settings, appearance
```

Inspired by the ideas behind tools like World Anvil, vvd and ScribesBlade. This is an independent open-source project.

### Map editor & styles
World maps can be edited by hand after generating (✏️ **Edit this map**): terrain brushes (raise, lower, mountains, smooth, flatten, add land, add sea), biome and realm painting, and adding, moving, renaming and deleting towns and capitals. Rivers, lakes, forests, borders and roads recalculate after every stroke, with undo/redo. Saved world maps keep their editable terrain, so **✏️ Edit terrain, towns & style** on a map reopens it in the editor.

Eight world styles: Parchment, Atlas, Night, **Ink & Quill** (pen-and-ink epic fantasy), **Storybook** (bright and colourful), **Painted** (painterly with cloud edges), **Realistic** (shaded elevation) and **Political** (coloured realm cells).

City maps have five styles, including **Storybook** (coloured roofs, cobbled streets, lush trees, painted water) and **Ink & Quill**.

### Drawing on maps
Any map, generated or uploaded, has a 🖌️ **Draw** mode: pen, marker, line, box, circle, text (serif, calligraphy or plain), 18 map stamps (castle, tower, village, temple, ruins, camp, cave, peak, grove, ship, port, sea beast, danger, battle, X marks the spot, flag, magic, star), an eraser, a move tool and layers you can show or hide. Hidden layers are left out of the player wiki, so they're handy for GM-only notes. Hold Space or use the middle mouse button to pan while drawing.

The generator fills the screen: scroll to zoom, drag to move (Space, middle or right mouse button while editing). City maps can show more countryside (**Area shown**: close up → whole valley) and can be edited by hand: add, remove and repaint buildings, plant or clear trees, draw a new town wall (gates open where roads cross), draw, colour and remove roads.

**Map size:** world maps come in km presets (Region 400 × 250 up to Whole world 16,000 × 8,000) or any custom size; cities from Close up (0.8 × 0.64 km) to Whole valley (6 × 4.5 km) or custom. Zooming in redraws the visible part at full sharpness. In the generator the frame, title, compass and scale bar stay pinned to the edges of the view (the scale bar follows the zoom), and **📸 Snapshot** saves exactly what's inside the frame as a picture attached to the map.

**Map folders:** every map card has a 📁 folder showing the map and its snapshots. Snapshots have names and captions with @ links, so they appear on the entries they mention.

