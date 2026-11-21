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

The web has **the Cosmos** at its centre (solar systems and other cosmos entries hang straight off it) and a **master node** for each entry type, with every entry hanging off its type. **Places inside places** nest as sub-nodes: towns inside their realm, realms inside their planet. Set this with an entry's **Part of** field, a map's **This map shows** setting, or by attaching a map to a planet in the Cosmos. Generated world maps do it automatically, and saving an edited map adds new realms and towns to the World Bible in the right place. Relationships are **coloured by kind** (hostile red, love pink, family amber, friendly green, power purple, place blue). The kind is worked out from the wording, or you can pick it. Filter to one kind, or choose *None* to see just the tree. Fold any node to tuck its sub-nodes away, or use the **Depth** slider to choose how many levels of sub-nodes show. Nodes float freely and settle around anything you drag. Middle-drag pans. Double-click a place to open its map. **🌳 Family tree** lays characters out by generation from *parent of*, *child of*, *married to* and *sibling of* relationships, and can show one person's family.

New entry type: **🪐 Cosmos** for planets, stars and planes. The Cosmos editor creates entries of this type. The Cosmos star chart can hold several **solar systems** (＋ Solar system): each has its own star and its own World Bible entry, with planets nested inside it in the World Web. The **🌌 Universe** view shows every system at once, and you can double-click a world to fly into its system. Pick a system from the searchable, alphabetical list in the header. Middle-drag pans the view. Right-click a world to edit it, add a moon or an orbiting world, connect it, add it to the World Bible, open its maps, or move it to another system.

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

The generator fills the screen: scroll to zoom, drag to move (Space, middle or right mouse button while editing). City maps can show more countryside (**Area shown**: close up → whole valley) and can be edited by hand: add, remove and repaint buildings, plant or clear trees, add houses in tight street-aligned rows (Uniform) or scattered (Loose), draw as many walls as you like (closed loops or open lines; gates open where roads cross) and knock them down, draw roads that latch onto existing roads (Connected) or go anywhere (Free), colour and remove roads, and draw rivers and lakes or drain them. Right-click cancels a wall, road, river or lake you're drawing. River width is a slider. **🏛️ Buildings & sets** places 20 fantasy buildings (castle, church, cathedral, chapel, blacksmith, tavern, inn, guild hall, town hall, mage tower, watchtower, barracks, stables, windmill, granary, manor house, library, alchemist, bathhouse, arena). It also places 7 sets with their own streets (market square, town block, temple square, castle compound, crossroads hamlet, noble estate, farmstead). Rotate them with the scroll wheel or A / D, resize them, let their streets join onto nearby roads, and drag a placed piece to move it. Rivers and roads are drawn the same way in the world and city editors: **Freehand** (drag) or **Point to point** (click, then double-click or Enter). **Edit & bend** (world and city) lets you pick up any road or river (generated rivers too) to change its width with a slider (mouth and source width for drawn world rivers) and pull it into a curve. Double-click the line to add an elbow where it should articulate, and double-click an elbow to remove it. **Map icons** (castles, cities and crests, mines, barrows, dwarven ruins, forts, shrines, dragon lairs, giant camps, strongholds, ships, portals and more, 47 in all, in a style that matches the map or as flat cream **Marker** icons) can be dropped onto both city and world maps, then dragged, resized, flipped or removed; they redraw to match the map style.

**Map size:** world maps come in km presets (Region 400 × 250 up to Whole world 16,000 × 8,000) or any custom size; cities from Close up (0.8 × 0.64 km) to Whole valley (6 × 4.5 km) or custom. Zooming in redraws the visible part at full sharpness. In the generator the frame, title, compass and scale bar stay pinned to the edges of the view (the scale bar follows the zoom), and **📸 Snapshot** saves exactly what's inside the frame as a picture attached to the map.

**Map folders:** every map card has a 📁 folder showing the map and its snapshots. Snapshots have names and captions with @ links, so they appear on the entries they mention.

**More generator tools:** a landmass template picker (Continent, Large continent, Twin continents, Old world, Pangea, High/Low island, Volcano, Atoll, Archipelago, Shattered, Fractious, Mediterranean, Peninsula, Isthmus, Coastal region, Desert continent) with live previews, plus **Import heightmap** from any greyscale picture. A **Pastel political** style (Azgaar-like), a **Layers** panel (realm colours, borders, mountains, forests, rivers, roads, towns and each kind of label), hand-drawn rivers and roads, a dry-up-rivers brush, custom and renamed labels, and Regenerate buttons for names, borders, towns and automatic roads. **Whole world** maps wrap east–west with polar ice and can be viewed as a spinning **🌐 globe**.

**Timeline overview:** switch the Timeline to ⟷ Overview for a big horizontal chart with era bands, events above the line and sessions below. Scroll to zoom from millennia down to days, drag to move, hover anywhere to read the date and hover an event for its details. The calendar zooms out (click its title) from month → year (all months) → twelve-year view.

**🌌 Cosmos:** a spinnable 3D star chart of worlds, moons, stars, planes and demiplanes with animated portals, routes, orbits and bonds. Hover for names, click for details and the maps attached to each world, double-click to fly to it, Shift-drag to reposition it. In the editor, search to attach maps, link or create a World Bible entry, and pick a Type (or name your own custom type).



## 🛠️ Asset Forge
Make your own assets. You can draw **custom map icons** from boxes, ovals, click-point shapes, lines and freehand strokes in the same 100×100 box as the built-in icons. Fills use colour *roles* (Stone, Roof, Leaf, Gold…), so each icon repaints to match every map style; an exact colour stays fixed. You can add a picture to trace over, and preview the icon in Parchment, Storybook, Night, Ink & Quill and Marker looks. Custom icons appear in the map generator's 🐉 Map icons palette under the group name you give them. The Asset Forge is built so more kinds of custom asset can be added later.

**Right-click menus:** in the map viewer (select or deselect pins, open, rename, measure, add a pin, drawing tools) and in the map generator (select or deselect icons and lines, quick tools, undo, fit). Right-drag still pans in the generator.


## 🎲 Dice table
From the dice tray, **Open the dice table** opens a big window where dice really roll. Build a pool (click a die to add one, right-click to remove one, set a modifier) and hit Roll. The dice tumble across the tray, bounce off the walls and each other, and land on the result; the total and every die are shown alongside. Natural 20s glow gold and natural 1s red, and dice dropped by advantage or disadvantage are faded. Click the tray to roll again. While the table is open, rolls from the tray or the GM screen tumble there too. There are five trays (Tavern table, Arcane velvet, Dungeon stone, Explorer's map, Starfall), or you can use **your own picture**, and you can pick any dice colour. The window can be dragged anywhere and remembers your settings.
