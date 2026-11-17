# Game polish pass (branch `game-polish`)

Status: **built and tested on `game-polish`; not merged or deployed.** Review it locally first.

## How to review

```bash
cd ~/Documents/Projects/lingo_pkmn
git checkout game-polish
./start.sh            # http://localhost:5173
```

Each change is its own commit, so you can drop any one with `git revert <sha>`:

| Commit | Change |
|---|---|
| `79d5669` | Challenges: explanations, retry after a wrong answer, hint, back away, number keys |
| `97e7afd` | Run carries across levels; level clear card; lock counter; sealed-stairs message |
| `75f285c` | Level data: NPCs moved off walls (5 Spanish levels) and off the player start (Japanese level 1) |
| `0ac82ba` | Resume keeps its language; per-course checkmarks; game over outcome and retry |
| `03648f9` | Bigger map on desktop; D-pad on touch tablets; hold to walk; keyboard hint |
| `15f304f` | "Lingo SMT" renamed to Lingo Dungeon; login copy; favicon and meta tags |
| `2ead1d5` | Word bank now fills from Spanish challenges (was 4 words per full run, now 54) |

## What changed, and what to try

### Challenges
- **Explanations.** After a right answer, the challenge's explanation now appears (for example, "'え' is 'e'. The mouse nods like this was legally binding.") and waits for **CONTINUE**. Every challenge already had this text, but it was never shown.
- **Wrong answers.** Before, a wrong answer revealed the right one and closed the challenge. Now it marks only your pick, costs a heart and 25 XP, shows the hint, and lets you try again. The hint previously could never appear, because the attempt counter reset every time the challenge closed.
- **Back away** (button or **Esc**) leaves a challenge without penalty, so you can explore first.
- **Keys:** **1–4** answer; **Enter / Space / E** continue; **Esc** also closes NPC dialogue. Number labels on the choices only appear on keyboard devices.

*Try:* answer one wrong, read the hint, press Esc, come back, then answer right.

### Progression
- **Score, run time and learned words carry across levels.** Before, each level reset them, so the +200 stairs bonus vanished immediately and the game over screen only counted the last level.
- **Level clear card** between levels: bonus, run total, new words from the level, and what's next. The next level loads and saves behind the card, so quitting there keeps your progress. Hearts refill each level.
- **HUD** shows `LOCKS n/m`, then `STAIRS OPEN`.
- **Sealed stairs** now say why they won't open.

*Try:* walk onto the stairs early, then finish a level.

### Bugs fixed
- **Resuming a Spanish run after a reload** loaded the Japanese level with the Spanish save. Saves now record their language, and the chosen course is remembered.
- **Checkmarks** only ever showed for Spanish, and completions weren't tied to a course. They're now stored per course (`es:3`, `ja:3`), so both courses show checkmarks and their own n/10 count. Older entries read as Spanish.
- **Dying on the last level showed VICTORY.** Game over now uses the actual outcome. A loss offers **TRY LEVEL n AGAIN** and **LEVEL SELECT**, instead of only restarting from level 1.
- **Learned-word duplicates.** The same kana taught by a mouse and a door was listed twice; words are now unique per run.
- **Spanish word bank was almost empty.** The extractor only looked for two quoted phrases in the explanation, and most Spanish explanations quote just one. Extraction now lives in `engine/words.js`. It also checks the answer and the prompt, skips conjugation questions, and puts the Spanish side first. A full Spanish run now adds 54 words instead of 4.
- **Misplaced NPCs.** In five Spanish levels (3, 5, 7, 9, 10) an NPC stood inside a wall. In Japanese level 1, the Lantern Intern stood on the player's start tile and only appeared once you moved. Each was moved one tile onto floor, checked so no part of the map gets cut off.

### Layout and controls
- **Desktop:** the map scales up to fill the screen. It was capped at about 464px wide in a 480px column.
- **Touch tablets** (an iPad, for example) now get the D-pad. Before, it was hidden at 768px and wider, so tablets had no way to move. Controls are now chosen by input type, not screen width.
- **Hold a D-pad direction** to keep walking; a tap still moves one tile.
- **Keyboard devices** get a one-line controls hint under the map.

### Polish
- "Lingo SMT" is now **Lingo Dungeon** in the page title and on the menu.
- The login copy now mentions both courses.
- New pixel-art door favicon (this also fixes the `/favicon.ico` 404), plus a meta description and theme-color.
- Japanese words in word-bank lists use the Japanese font instead of the tiny pixel-font fallback.

## Testing done
- **Storage unit tests** (Node), updated for per-course completion keys and old-format entries.
- **Headless Chrome tests against the dev server:**
  - challenge flow: wrong pick, hint, Esc, right pick, explanation, Enter
  - progression in both courses: sealed stairs, lock counter, level clear card, score carried into level 2, save at level 2
  - persistence: Spanish resume after a reload, remembered course, per-course checkmarks, retry after a loss, no VICTORY on dying at level 10
  - layout: desktop map size and hint; D-pad on a touch tablet and a phone; tap moves one tile, hold walks
  - the earlier regression play-through
- **A complete run of each course, levels 1–10, to the victory screen,** with the score and words checked. Totals: Japanese 10,000 XP and 46 words; Spanish 9,700 XP and 54 words.
- **Word extraction checked against all 138 challenges:** every pair puts the study language first.
- **The production build served under `/lingo-dungeon/`:** the regression play-through, the challenge flow and Spanish progression all pass.

## Not changed (ideas for later)
- Japanese glyphs inside English prompt text still render small, because the pixel font has no Japanese characters.
- The run timer keeps running while the level clear card is open.
- The word bank mixes both courses in one list.
- There's no sound.

## Deploying after review
1. Merge `game-polish` into `main` and push. The Pages workflow deploys `lingo_pkmn`, which serves lingo-dungeon.com.
2. Run `git push pages-copy main` to update the github.io copy at `raiidahmed.github.io/lingo-dungeon/`.
