# 3D art direction: board, checkers, dice

Status: UI foundation, CLAUDE.md §17 step 0. Implemented in step 6 (`packages/game3d`, visual layer owned by the UI specialist). Normative constraints come from CLAUDE.md §11.1, §11.2, §11.4, §11.6. Numeric constants live in `@bg/design-tokens` (`scene3d`, `boardDefaultTheme`, `duration`, `easingCurve`).

---

## 1. Mood

**A premium Persian craft object on a dark table.**
- A handmade nard board in warm walnut, with khatam-inspired geometric inlay.
- Brass hinges and corner caps. Bone and ebony checkers.
- Soft, baked, late-afternoon light.
- Everything reads as tactile and expensive, not glossy or neon.

Reference qualities (not references to copy):
- Tight wood grain.
- Satin (not mirror) finishes.
- Crisp inlay edges.
- Gentle ambient occlusion where parts meet.
- Warm bounce light from the wood.

**Originality.** Every model, texture, and ornament is authored for this project or properly licensed (§11.2). Do not trace, photograph, or sample existing boards, renders, or khatam pieces. Build the ornament procedurally from our own geometry (8-point stars, hexagons, triangles), the same family as the UI brand mark and coin glyph.

**The board is the product (§21.2).** The UI chrome around it is dark and quiet (`palette.dark.background` `#14110f`), so the board carries the color. Nothing in the scene competes with the checkers and dice: ornament lives on the frame and the bar, never on the playing field under the checkers.

---

## 2. Scene composition

The canvas contains only the board, checkers, dice, the doubling cube, and 3D highlights. Player bars, timers, buttons, reactions, and menus are HTML overlays (§11.1).

| Element | Model | Notes |
| --- | --- | --- |
| Board | One base GLB: frame, two halves, bar, bear-off trays, hinge and corner caps | Themes swap materials and textures only |
| Points (triangles) | Part of the board field texture, not geometry | Saves triangles and draw calls |
| Checker | One base GLB, instanced (30 instances, one draw call per material) | A shallow cylinder with a bevelled rim and an engraved top face |
| Dice | One base GLB, two instances | Rounded cube, recessed pips (normal and AO, not geometry) |
| Doubling cube | One small GLB | Engraved numerals (64 max) via texture atlas |
| Highlights | Instanced flat decals on the field | Legal destinations and selection (§5) |
| Floor / table | A single large quad with a baked soft contact shadow of the board | No real-time shadow for the board |

---

## 3. Materials (default theme "Walnut & Brass")

Base colors are tokens (`boardDefaultTheme`); detail comes from textures. All materials are PBR metallic-roughness.

| Part | Base color | Roughness | Metalness | Texture notes |
| --- | --- | --- | --- | --- |
| Frame | walnut `#5a3a22` | 0.55 | 0 | Straight grain along the long edges, darker end grain at the corners, satin finish |
| Playing field | maple `#d4bb8f` | 0.6 | 0 | Very quiet grain, so checkers read clearly |
| Dark points | rosewood `#4a2c1b` | 0.55 | 0 | Thin brass hairline border |
| Light points | bone `#e6d6b2` | 0.5 | 0 | Thin brass hairline border |
| Inlay bands (frame, bar) | turquoise `#3fa59c`, bone, ebony | 0.45 | 0 | Khatam star band, authored as a tiling texture |
| Brass (hinges, corner caps, bar rivets) | `#c9973f` | 0.35 | 1 | Brushed, subtle; no mirror reflections (no env map beyond a small baked one) |
| Checker light (player A) | ivory `#ede4d0` | 0.4 | 0 | Engraved 8-point star on top, darker rim ring `#8f7a55` |
| Checker dark (player B) | ebony `#2a201b` | 0.35 | 0 | Engraved concentric-ring motif on top, brass rim ring `#c9a46a` |
| Dice body | `#f2ebdc` | 0.35 | 0 | Soft subsurface look faked in the albedo, slightly rounded edges |
| Dice pips | `#241b16` | 0.6 | 0 | Recessed via normal map and AO |

**Ownership is never shown by color alone** (P§13). The two checker sides differ in color and luminance, and also in:
- **Top-face motif:** a star versus concentric rings. Readable even for achromatopsia.
- **Rim treatment:** a dark rim ring versus a brass rim ring.

The HTML player bars mirror both marks (`playerLight`/`playerDark` tokens plus the same motif as an icon).

**Themes.** A theme is a material set plus textures on the shared models (§11.2), with states `free`, `level_locked`, and `purchasable`. Authoring rules for new themes:
- Keep a clear luminance gap (≥ 3:1, measured on the texture's average color):
  - Between the two point colors.
  - Between the two checker sides.
  - Between each checker body and its rim ring. The rim is what outlines a checker against any point or field color: ivory on bone would otherwise disappear, as on a real board.
  - The `boardDefaultTheme` test in `packages/design-tokens/src/contrast.test.mjs` is the template; every new theme adds the same four checks.
- Keep the field under the checkers low-detail. Ornament goes on the frame and bar only.
- Keep checker motifs distinct per side (shape, not only hue).
- Never recolor the legal-move highlight or the selection ring per theme. They are system colors.

---

## 4. Lighting and shadows

| | Normal mode | Lite mode (§11.6) |
| --- | --- | --- |
| Baked | Lightmap and AO for the board (one 2048² atlas on mobile, 4096² allowed on desktop), baked contact shadow of the board on the table quad | Same bakes at half resolution |
| Real-time lights | Max 2: one warm directional key (sun-like, from the top-left of the board in its natural orientation) and one hemisphere fill (warm sky, dark wood ground) | 1 hemisphere light |
| Real-time shadows | Only under the dice: a single small shadow map (512²) restricted to the dice layer | None; a baked soft blob under each die |
| Checker shadows | Baked blob decals that move with the checkers (no shadow map) | Same |
| Environment | Small baked prefiltered env (256², KTX2) for the brass and satin wood | None |
| Tone mapping | ACES filmic, exposure tuned so the field maple sits around 70% luminance | Same |

- **Light direction is fixed to the board.** It does not follow the UI direction (RTL/LTR) or the camera framing.
- **Warmth comes from the light colors,** not from post-processing.
- **No post-processing** (bloom, SSAO, DOF) on mobile. It costs too much and fights the baked look.

---

## 5. Highlights and interaction feedback

| State | Visual | Not color alone |
| --- | --- | --- |
| Legal destination | Firouzeh (`legalMove` `#56c2b8`) flat decal on the point tip, plus a small ring marker at the landing slot | Ring shape |
| Selected checker | Lifts 4–6 mm, `selection` `#ffd684` outline ring | Lift plus outline |
| Drag in progress | Checker follows the pointer above the field, target point decal brightens | Position |
| Illegal drop | Checker returns along its path in `duration.checkerShort`, legal targets re-shown | Motion plus re-shown markers |
| Last opponent move | Faint trail decals on origin and destination points for one turn | Shape |
| Hover (mouse on `m.` desktop) | Legal destinations for the hovered checker preview at 60% | — |

**Input targets.** A checker is at least 44 CSS px wide on a 360 px wide portrait screen (`scene3d.minCheckerCssPx`, §11.1).
- The ray-cast pick radius may be larger than the visible checker.
- Point hit areas cover the full triangle plus the gap to the neighbouring point.

---

## 6. Camera and framing per breakpoint

- **Camera:**
  - Fixed, top-down, with a `scene3d.cameraTiltDeg` (15°) tilt toward the player.
  - No orbit or zoom gestures.
  - The field of view stays narrow (about 30° vertical) so there is little perspective distortion.
- **Framing:**
  - Recomputed on every resize and orientation change without reloading the scene (§11.7).
  - The app passes the framing to `packages/game3d`, which stays layout-agnostic.

| Breakpoint / orientation | Board orientation | Framing target |
| --- | --- | --- |
| xs, sm portrait (≤ 599) | Rotated 90°, so the long axis runs vertically and fills the width | Board width = viewport width minus 2 × 8 px. Player bars above and below. Roll, confirm, undo, and double live in the bottom 40% as HTML (§11.7) |
| sm landscape (short phones) | Natural (long axis horizontal) | Fit height between the top and bottom bars. Side rail for the controls |
| md (600–1023) | Natural | Board plus one side panel (move history and reactions); board takes the remaining width |
| lg (≥ 1024) | Natural | Centered in the 1280 shell between two side panels |

Rules:
- The board never mirrors for RTL (P§11). Point numbering and the home side follow the player's perspective only.
- The camera distance is solved so the whole board, including the bear-off trays, fits with an 8 px safe margin inside the canvas rect. It also respects `env(safe-area-inset-*)`, which the app passes in.
- The dice land inside the player's half, and the camera never cuts them off.

---

## 7. Motion in the scene

| Motion | Duration | Easing | Reduced motion | Lite mode |
| --- | --- | --- | --- | --- |
| Checker move, one hop | `checkerShort` 200 ms | `easingCurve.checker` | 80 ms, no arc | Straight slide, no arc |
| Checker move, default | `checker` 280 ms, low arc (lift ≈ 0.4 checker height) | `easingCurve.checker` | 100 ms, no arc | Straight slide |
| Checker to bar / bear-off | `checkerLong` 350 ms | `easingCurve.checker` | 120 ms | Straight slide |
| Multi-checker turn playback (opponent) | Sequential, 60 ms gap | — | No gap | No gap |
| Dice throw | Physics playback (§11.1), typically 1–2 s | Recorded | See open question below | Dice appear at rest after `diceFade` 300 ms |
| Cube offer | Cube lifts and turns to the new value, 250 ms | `standard` | Instant value change | Instant |

**Dice (§11.1).**
- The throw is pre-simulated off-screen with Rapier at 1/120 s steps and then played back.
- The server value is fixed before the animation starts. The resting face is corrected by a visual-mesh rotation offset, so the dice always show the server value.
- Dice collide with the floor and walls only, never with checkers.
- The visual throw uses `throw_seed`, so players and spectators see the same throw.

**Reduced motion and dice.** This is UX open question P§8-8. The UI recommendation is that `animations.reduced` or `prefers-reduced-motion` also uses the lite-mode fade for dice. It would be implemented behind one flag so the product owner's decision is a one-line change.

**Sound and haptics** are triggered from the same events (P§8). The visuals never wait for audio.

---

## 8. Performance budget (§11.4)

| Budget | Mobile (`m.`) | Desktop (`app.`, Phase 2) | Token |
| --- | --- | --- | --- |
| Frame rate | 60 fps on the reference mid-range Android (Snapdragon 6-series, 4 GB); lite ≥ 30 fps on low-end | 60 fps on Intel Iris Xe at 1080p | `scene3d.targetFps` |
| Device pixel ratio cap | 2 (lite 1.5) | 2 | `scene3d.dprCap` |
| Triangles (whole scene) | ≤ 60,000 | ≤ 60,000 | `scene3d.budget.triangles` |
| Draw calls | ≤ 50 | ≤ 50 | `scene3d.budget.drawCalls` |
| Real-time lights | ≤ 2 | ≤ 2 | `scene3d.budget.realtimeLights` |
| Board theme size | ≤ 1.5 MB | ≤ 3 MB | `boardThemeBytesMobile/Desktop` |
| Checker theme size | ≤ 300 KB | ≤ 300 KB | `checkerThemeBytes` |
| First scene load | < 6 s on 4G, < 1 s repeat (service-worker cache) | — | — |

Triangle and draw-call plan (target, with headroom):

| Item | Triangles | Draw calls |
| --- | --- | --- |
| Board (frame, field, bar, trays, caps) | ~18,000 | 6–8 (merged by material) |
| Checkers (30 instances × ~600) | ~18,000 | 2 (instanced, one per side) |
| Dice (2 × ~500) + cube (~500) | ~1,500 | 2 |
| Highlights, trails, shadows (instanced decals) | < 1,000 | 3 |
| Table quad | 2 | 1 |
| **Total** | **~39,000** | **~16** |

Asset pipeline:
- **Formats:**
  - glTF/GLB with Draco-compressed meshes and KTX2 textures (Basis UASTC for normal maps, ETC1S for albedo, roughness, metalness, and AO).
  - Texture sizes are powers of two. Mip-maps are generated.
- **Channel packing:** occlusion, roughness, and metalness are packed into one ORM texture per material.
- **Themes:**
  - Each theme is its own KTX2 bundle.
  - Loaded on demand when equipped or previewed, and cached by the service worker.
  - The old theme stays visible until the new one is ready (P§6.1).
- **Lazy loading:**
  - The engine (Three.js, R3F, Rapier WASM) and the default theme are lazy-loaded on the game route only.
  - The route shows `LoadingState variant="progress"` with the percent, the size remaining, and Cancel.
- **Per-theme checks in CI:**
  - Byte sizes against the budgets above.
  - Triangle and draw-call counts from a headless render against `scene3d.budget`.

---

## 9. Lite mode (§11.6): intentional, not broken

Lite mode keeps the same composition, colors, and ornament. It removes cost only:
- No physics throw: dice fade in at rest (`diceFade`).
- No real-time shadows: baked blobs under the dice.
- One hemisphere light. DPR 1.5.
- Half-resolution textures, from the theme's lower mip set. No separate asset is needed.
- Straight checker slides, no arc.

It must still look like the same premium board, only calmer. Review lite and normal side by side in the step 6 PR.

The frame-rate monitor may **suggest** lite mode after 10 s under 30 fps. It never switches on automatically.

---

## 10. WebGL2 unavailable

There is no 2D fallback (§11.4). `/match/[id]` and `/replay/[id]` show the unsupported-device content in place. It uses the `ErrorState` layout with the minimum requirements. The spec is in `system.md`.

---

## 11. Deliverables for step 6

1. Base GLBs: board, checker, die, and cube, with a triangle report.
2. The default "Walnut & Brass" theme (board and both checker sides), within budget.
3. A lighting bake and contact-shadow bake.
4. A camera framing function per breakpoint and orientation, with screenshots at the six §11.7 viewports plus phone landscape.
5. Normal and lite captures, with reduced motion demonstrated.
6. A performance capture on the reference device: fps, draw calls, and triangles over a scripted 5-point match (§16).

---

## 12. Step 6 implementation (`packages/game3d/src/scene`)

What shipped, and where it differs from the plan above. Numbers are measured, not targets.

**Entry points.** `@bg/game3d/scene` exports `GameBoard` (React Three Fiber, lazy-loaded by the app) and the framing helpers; `@bg/game3d/framing` is the pure math only (no three.js), so the app can choose the orientation before the engine loads; `@bg/game3d` keeps the dice pre-simulation. The Rapier WASM is imported on the first physics throw (the app preloads it on the match route unless lite mode is on).

**Models and textures are procedural, not GLB/KTX2 (deviation).** No authored assets exist yet, so the base models are built in code (`models.ts`) and every texture is painted on a canvas at runtime (`textures.ts`) from the tokens: walnut grain, the maple field with brass-edged points, the khatam star band on the bar, the checker top motifs (light side: engraved 8-point star; dark side: concentric rings), the dice face atlas, markers, and soft shadows. Nothing is downloaded, so the theme budgets (§8) are trivially met. The GLB/KTX2 pipeline in §8 stays the plan for authored themes; `theme.ts` already resolves theme keys and falls back to "default" for keys this build doesn't ship.

| Item | Triangles | Draw calls |
| --- | --- | --- |
| Board: slab, top face, merged rails, merged brass caps, contact shadow | ≈ 220 | 5 |
| Checkers: 2 instanced lathes (30 × ≈ 480) + 1 instanced blob layer | ≈ 14,600 | 3 |
| Dice: 2 rounded cubes (≈ 590 each) + 2 blob shadows | ≈ 1,200 | 4 |
| Highlights: source rings, selection ring, ≤ 4 targets, ≤ 8 trail arrows | < 40 | ≤ 21 |
| **Worst case** | **≈ 16,000** | **≤ 33** |

**Lighting.** A hemisphere fill plus one warm key light (`sceneLight` tokens); only the dice cast a real-time shadow (512² map, frustum fitted to the field). Lite mode: hemisphere only, no shadow map pass, DPR 1.5, half-resolution canvases, 28-segment checkers, no antialiasing. The canvas is transparent: the board floats on the chrome background with a baked contact shadow, so it works in dark and light schemes.

**Rendering on demand.** `frameloop="demand"`: frames render only while checkers move, dice play back, a marker changes, or the camera re-frames. Idle battery cost is zero. The MA-16 frame monitor counts only continuous frames (gaps over 250 ms don't count) and calls `onSlow` once after 10 s of animation under 30 fps.

**Framing (§6).** `fitCamera` solves the camera distance so the whole board, rails, and trays fit with a margin (8 px default), then re-centres the tilted projection. `bestOrientation` compares the checker size in both orientations; the app turns the board a quarter only when that is at least 15 % larger (portrait phones), so tablets in portrait keep the natural board (match.md §6 md row). Resizing and rotation re-frame without reloading the scene. In portrait, the viewer's home board and both trays sit at the bottom of the screen; the board never mirrors for RTL.

**Checker size on phones (deviation from §11.1's 44 px).** Measured with the match screen's chrome (top strip 48, two player bars 56, action bar 88): 33 px at 360 × 800, 35 px at 390 × 844, 39 px at 430 × 932. 44 px checkers don't fit: 12 points plus the bar and a tray along the long axis need about 14.5 checker widths, and the short axis needs about 9.2 (two 4-checker points and the middle gap). Mitigations: the hit area of each point is the whole triangle strip plus half the middle gap (≈ 35 × 170 px), not the checker; the bar and tray are whole-region targets; drag works from anywhere on a source point; and MA-18 offers the full turn as a list of ≥ 44 px buttons. Needs a product decision (main agent / UX).

**Checker stacking.** Four per row on a point; further checkers sit in the gaps of the row below (4, 3, 4, 3, 1). Borne-off checkers stand on edge in the tray; bar checkers wait on the bar half nearest the board they enter.

**Motion (§7).** Checkers use the `checker` easing curve and the `checkerShort`/`checker`/`checkerLong` durations by distance, with a 0.45-unit arc (enough to clear a stack) in normal mode and a straight slide in lite or reduced motion. An opponent's move plays step by step (60 ms gap) from the `turn.moved` list; a full `match.state` snaps without animation. Checker identities follow the top of each stack, so undo animates the same checker back.

**Dice (§11.1).** `simulateThrow` runs on the first frame after `turn.rolled`; the dice appear only when the recorded trajectory starts, and the visual mesh gets the face offset, so the rest face always equals the server value (verified visually for 5–3 in normal and lite, and by the existing 10,000-throw test in `dice.test.ts`). If a throw doesn't settle within the retry budget, the dice fade in at rest (the lite placement). The throw lands in the thrower's right-hand half: the viewer's rolls at the bottom, the opponent's at the top. **Reduced motion** uses the lite fade (`REDUCED_MOTION_DICE_FADE`, match.md §10 Q11, one-line change if the product decides otherwise). Rest poses and spins come from the throw seed's PRNG, never `Math.random`.

**Highlights (§5).** Movable sources: a thin firouzeh ring on the top checker. Selected: lift + a `selection` ring. Legal destinations: a ring-and-dot disc in `legalMove` with a dark `markerInk` outline and the die digit in the viewer's locale (the "Off" word on the tray), counter-rotated so it reads upright in portrait. Hover (mouse) previews destinations at 60 %. The opponent's last move: chevron arrows on the origin and destination, until this player rolls. Markers are tested for contrast on the darker point color (`contrast.test.mjs`).

**Preview route.** `/dev/board` (same production guard as the gallery) renders the scene alone: `?lite=1`, `?reduced=1`, `?side=1`, `?moves=1&select=13` (highlights), `?dice=5,3` (a throw), `?mid=1` (bar and borne-off checkers).

**Not done in step 6:** authored GLB/KTX2 assets and baked lightmaps (procedural stand-ins above); the reference-device performance capture (§11, deliverable 6; needs the device lab); the doubling cube as a 3D model (match.md puts the cube chip in HTML, which is what shipped).
