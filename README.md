# Highway Blitz

A 3D arcade highway racer for the phone browser, built with Three.js and Vite, using free CC0 / CC BY 3D assets (see [CREDITS.md](CREDITS.md)).

**Play:** https://sheriefsobhy.github.io/racing-3d/

## How to play

- The car accelerates by itself. Steer with the ◀ ▶ buttons, or pick **Tilt** on the start screen.
- **NITRO** gives a burst of speed. The bar fills slowly over time, from blue nitro pickups, from near misses, and by drifting.
- Hold **DRIFT** through curves to slide around them and fill nitro faster.
- Tap the **camera** button (top right) to switch views: Chase, Far chase, Hood, Bumper. **SETTINGS** (Start or Pause menu) sets field of view, camera distance/height, smooth follow, camera shake and the speed effect. **Graphics: Low / High** — High adds sky reflections on the cars and normal-mapped road, ground and barriers; Low uses plain textures, no reflections and a shorter view distance. Settings are saved on the device.
- **Sound:** engine, drift, crash, nitro, coin and near-miss sounds plus music. Tap the speaker button (top right) or press M to mute; volumes are in **SETTINGS**. Audio starts after your first tap (a browser rule).
- Dodge traffic: a crash slows you down, and 3 crashes end the run.
- Score comes from distance, coins, drifts and near misses (pass close to traffic; chain them for a combo).
- Spend coins in the **Garage** to unlock 3 more cars.

Keyboard: arrows / A-D steer, Space / W nitro, Shift / S drift, P / Esc pause, C camera view, M mute.

Add `?debug` to the URL to show an FPS counter.

## Development

```bash
npm install
npm run dev      # http://localhost:5173/racing-3d/
npm run build    # outputs to dist/
```

Every push to `main` builds the game and deploys it to GitHub Pages (`.github/workflows/deploy.yml`).

## Performance notes

- Assets load behind a loading screen with a progress bar. The whole game is about 3.4 MB of files (about 2.7 MB transferred on High, 2.2 MB on Low, which skips the HDR and normal maps). The 1.1 MB music file streams separately after the first tap, so it does not slow the loading screen.
- Car: one glTF model (about 48k triangles), meshopt-compressed, WebP textures (max 1024 px). Parts are merged by material at load time to cut draw calls.
- Road and scenery are built per 80 m section, with one mesh per material (road, shoulder, grass, barriers, lamps, trees, buildings). All trees share one texture atlas.
- Lambert/Phong materials for the world; PBR plus HDRI reflections only on the player car (High). No real-time shadows or post-processing.
- Pixel ratio is capped at 2 and drops automatically if the frame rate stays under ~48 fps. If it is still slow, graphics switch to Low (unless the player picked a level).

## Assets

Source assets are processed by scripts in `tools/` (`build-car.mjs`, `build-world.mjs`); their output in `public/assets/` is committed. See [CREDITS.md](CREDITS.md) for authors and licenses.
