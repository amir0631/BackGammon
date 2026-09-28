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
