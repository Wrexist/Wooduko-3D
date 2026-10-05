# LEARNINGS.md

- Dragged pieces must hover on the camera's line of sight above their landing spot, with a near-overhead light, otherwise the piece, its shadow and the drop spot disagree and players get confused.
- A recess as deep as the block height (blocks flush with the table) reads far better than shallow cells.
- Highlights need to fade/pulse, not snap on/off; snapping needs hysteresis (~0.7 cell) to stop flicker.
- A procedural wood texture must be tileable (integer sine frequencies over the width) or a seam shows down the table.
- Headless Chromium + SwiftShader runs at a few fps: screenshot timing there is not real timing.
- TypeScript 7 (native port) is npm `latest` but typescript-eslint only supports `<6.1`. Pinned TS 6.0.3.
- Playwright needs `--use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL screenshots headless (see `scripts/shot.mjs`).
