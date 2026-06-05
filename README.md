
# Icarus
[![MIT License](https://img.shields.io/github/license/Ileriayo/markdown-badges?style=for-the-badge)](https://choosealicense.com/licenses/mit/)

A 2D multiplayer game engine built on [PixiJS](https://pixijs.com/), with rollback netcode for deterministic online play over a WebSocket relay.

## Architecture

### Engine (`src/engine/`)

A lightweight ECS-style framework wrapping PixiJS v8:

| Module | Purpose |
|---|---|
| `Engine` | Initializes the PixiJS `Application`, manages the game loop, and handles scene transitions |
| `Scene` | Owns a collection of `Entity` instances; routes `update` ticks and handles spawn/despawn |
| `Entity` | Base class for game objects — wraps a PixiJS `Container` and exposes `onInit`, `onUpdate`, `onDestroy` lifecycle hooks |
| `Input` | Global keyboard state (held / pressed / released) with bitmask helpers for rollback-safe input serialization |
| `Collision` | AABB overlap and point-in-rect tests |
| `Signal` | Typed event emitter |

### Rollback Netcode (`src/rollback.ts`)

`RollbackSession` implements GGPO-style rollback for two-player matches:

- Sends a 5-byte packet per frame `[frame: u32le, input: u8]` over any `Transport` (WebSocket, etc.)
- Maintains a ring buffer of up to `maxRollback` (default 8) state snapshots
- On misprediction: restores the divergent snapshot and re-simulates up to the present frame
- Early-arriving remote inputs are parked in a future-input map and consumed when their frame is reached
- `onDesynced` fires when a remote input arrives outside the rollback window

The transport is abstraction-first — anything with `send`, `addEventListener`, and `readyState` works.

## Stack

- **Renderer** — PixiJS v8
- **Bundler** — Vite
- **Language** — TypeScript
- **Runtime** — Bun

## Getting started

```sh
git clone https://github.com/jun-ro/Icarus.git
cd Icarus
bun install
bun run dev
```
