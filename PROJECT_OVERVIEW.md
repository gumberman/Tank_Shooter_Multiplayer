# Tank Shooter Multiplayer - Project Overview

## What It Is
Real-time multiplayer tank shooter game. 2-6 players, team-based combat, first to 24 kills wins.

## Architecture

### Stack
- **Frontend**: Vanilla JS + HTML5 Canvas → GitHub Pages
- **Backend**: Node.js + Express + Socket.io → Render (free tier)
- **Network**: Client-side prediction + server reconciliation + interpolation

### Key Design
- **Server authoritative**: All game logic, collisions, shooting validated server-side
- **Client prediction**: Local player movement applied immediately, corrected by server
- **Interpolation**: Remote players rendered 50ms in past for smoothness
- **Update rates**: Server 30ms (33/sec), Client 16ms (60 FPS)

## Project Structure

```
/docs (GitHub Pages)
  - constants.js       # Game config (pure browser)
  - gameLogic.js       # Shared logic (pure browser)
  - game.js            # Main game class
  - networkManager.js  # Socket.io client wrapper
  - index.html, styles.css

/server (Render)
  - server.js          # Express + Socket.io entry
  - roomManager.js     # Room lifecycle
  - room.js            # Lobby & game room state
  - gameServer.js      # Authoritative game loop
  - aiController.js    # Server-side bot AI
  - package.json

/shared
  - constants.js       # Shared config (Node.js)
  - gameLogic.js       # Shared logic (Node.js)
```

## How It Works

### Lobby Flow
1. Player creates room → gets 6-char code
2. Others join with code
3. Players switch teams / add bots
4. Host starts game

### Game Loop
**Server (30ms tick):**
1. Process player inputs from queue
2. Update bot AI
3. Update bullets & collisions
4. Check win conditions
5. Broadcast state to all clients

**Client (16ms render):**
1. Send input to server
2. Apply input locally (prediction)
3. Receive server state
4. Reconcile own position
5. Interpolate remote players
6. Render frame

### Network Protocol
- `createRoom`, `joinRoom`, `startGame`
- `switchTeam`, `addBot`
- `playerInput` (client → server)
- `gameState` (server → client, every 30ms)
- `gameOver`

## Important Files

### Server
- `gameServer.js:110` - Main game loop
- `gameServer.js:390` - Bullet collision (server validates all hits)
- `aiController.js` - Simplified AI (find enemy, aim, shoot)

### Client
- `game.js:1117` - Handle server state updates
- `game.js:1207` - Interpolate remote players
- `game.js:1166` - Reconcile own tank with server
- `game.js:1562` - Apply input (client prediction)

## Deployment

### URLs
- **Game**: https://gumberman.github.io/Tank_Shooter_Multiplayer
- **Server**: https://tank-shooter-multiplayer.onrender.com
- **Health**: https://tank-shooter-multiplayer.onrender.com/health

### Deploy Process
1. Push to GitHub main branch
2. GitHub Pages auto-deploys `/docs` (~1 min)
3. Render auto-deploys server (~2 min)
4. Hard refresh browser to clear cache

## Key Constants

```javascript
SERVER_TICK_RATE: 30         // Server update every 30ms
INTERPOLATION_DELAY: 50      // Render 50ms in past
MAX_ROOM_PLAYERS: 6          // 2-6 players per room
WIN_SCORE: 24                // First team to 24 kills
SHOOT_COOLDOWN: 1000         // 1 second between shots
```

## Common Issues

**CSP Errors**: Use pure JS, no `eval()`, `typeof module` checks trigger CSP
**Duplicate declarations**: Browser scripts don't export, just declare
**Bullets not rendering**: Check if `bullet.draw` is function (practice) vs plain object (multiplayer)
**Players can't see each other**: Check interpolation buffers populated, verify `isBot` flag
**Forced 3v3**: Removed auto-fill, server respects lobby configuration

## Tech Notes

- No build process, pure ES5/ES6
- Socket.io for real-time communication
- Seeded obstacle generation for map consistency
- Client prediction for <20ms input lag feel
- Free tier supports ~10-20 concurrent rooms

## Files Modified from Original

- `game.js`: Added multiplayer mode, network handlers, interpolation
- Split constants/logic into shared files
- Created entire `/server` backend from scratch
- HTML: Added Socket.io CDN, lobby UI, team selection

---

**Last Updated**: 2026-02-16
**Status**: Fully functional multiplayer game
