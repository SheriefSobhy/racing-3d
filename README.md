# Highway Blitz

A low-poly 3D arcade highway racer for the phone browser, built with Three.js and Vite.

**Play:** https://sheriefsobhy.github.io/racing-3d/

## How to play

- The car accelerates by itself. Steer with the ◀ ▶ buttons, or pick **Tilt** on the start screen.
- **NITRO** gives a burst of speed. The bar fills slowly over time, from blue nitro pickups, from near misses, and by drifting.
- Hold **DRIFT** through curves to slide around them and fill nitro faster.
- Tap the **camera** button (top right) to switch views: Chase, Far chase, Hood, Bumper. **SETTINGS** (Start or Pause menu) sets field of view, camera distance/height, smooth follow, camera shake and the speed effect. Settings are saved on the device.
- Dodge traffic: a crash slows you down, and 3 crashes end the run.
- Score comes from distance, coins, drifts and near misses (pass close to traffic; chain them for a combo).
- Spend coins in the **Garage** to unlock 3 more cars.

Keyboard: arrows / A-D steer, Space / W nitro, Shift / S drift, P / Esc pause, C camera view.

Add `?debug` to the URL to show an FPS counter.

## Development

```bash
npm install
npm run dev      # http://localhost:5173/racing-3d/
npm run build    # outputs to dist/
```

Every push to `main` builds the game and deploys it to GitHub Pages (`.github/workflows/deploy.yml`).

## Performance notes

- Road and scenery are merged into one vertex-coloured mesh per 40 m chunk (one draw call each).
- Lambert/Phong materials, one directional + hemisphere light, no real-time shadows or post-processing.
- Pixel ratio is capped at 2, and drops automatically if the frame rate stays under ~48 fps.
