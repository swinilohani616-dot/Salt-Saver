# Function notes 5: the landing page

[js/landing.js](../../js/landing.js) with [css/landing.css](../../css/landing.css) and [index.html](../../index.html)

**File history**
| Step | Change | Why |
|---|---|---|
| [11](../04-MY-STEPS.md#step-11) | Made from your capsule design | You pasted it |
| 11 | Suggestions come from the real database | The design had 12 fixed items |
| 11 | Became the front page | You asked |
| 11 | Smaller capsule, bigger text | You asked |
| 11 | Capsule stays on the opposite side of the text | You asked: it was "on the text" |
| [13](../04-MY-STEPS.md#step-13) | New font and closing line | You asked |
| [16](../04-MY-STEPS.md#step-16) | Centred, then undone | You asked for both |

## Part 1: search

### `searchUrl(text)`
- **What:** makes `search.html?q=...`.
- **Why:** this page only hands the search over. Results are on `search.html`.

### `mountSearch()`
- **What:** connects the input, the form, the chips and the keyboard.
- **Why:** one function starts the search half. It works even if 3D fails.

Inside it:

| Function | What | Why |
|---|---|---|
| `close()` | Hide the list | Click outside or Escape |
| `show(...items)` | Show the list | |
| `info(text)` | A line of text in the list | "No suggestions…" |
| `allResults(q)` | The "See all results" link | |
| `suggestFor(raw)` | Ask the server for names. Ignores late answers (`seq`) | An old answer must not replace a newer one |

**Found while building (Step 11):** a keyboard user could reach the box while it was invisible. The `focusin` listener jumps to the end.

## Part 2: the 3D capsule

### `mountCapsule(renderer)`
- **What:** builds the scene, the light, the capsule, the particles and the scroll story.
- **Why:** runs only if Three.js, GSAP and WebGL work. Otherwise `<html class="no3d">` shows the text without the capsule.

| Inside | What | Why |
|---|---|---|
| `softbox(...)` | A bright panel that is only reflected | Makes the capsule glossy without an image file |
| `halfGeo(r, len)` | The shape of half a capsule | Two halves, so it can open |
| `tex(stops)` | A soft round picture drawn by code | For the shadow and the particles |
| `S` (state object) | Position, turn, openness, burst | The scroll changes `S`, and the drawing reads `S` |
| `travel(t0, dur, x, ...)` | Move to the other side while flipping | Turn and move use one speed, so it reads as one motion |
| `tl` (timeline) | The whole story, tied to the scroll | The capsule changes side at 190 and 330, when no text is on screen |
| `resize()` | Fit the window | |
| `easeOut(t)` | Fast, then slow | Particles |
| `frame()` | Draws one picture, about 60 times a second | |

If the visitor prefers reduced motion, flips are small and nothing floats.
