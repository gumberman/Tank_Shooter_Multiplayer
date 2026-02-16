# Tank Shooter - Online Multiplayer

A fast-paced 3v3 team-based tank shooter game with online multiplayer support.

## Features

- **Online Multiplayer**: Play with 2-6 friends using room codes
- **Practice Mode**: Train against AI bots locally
- **Team-Based Combat**: 3v3 battles (AI bots fill empty slots)
- **Smooth Gameplay**: Client-side prediction and server reconciliation
- **Real-time Sync**: Socket.io for low-latency multiplayer

## Game Modes

### Multiplayer
- Create or join rooms with 6-character room codes
- 2-6 players supported
- AI bots automatically fill remaining team slots
- First team to 24 kills wins

### Practice Mode
- Play offline against AI bots
- Perfect for learning game mechanics
- Same gameplay as multiplayer

## Architecture

### Client (Frontend)
- **Technology**: HTML5 Canvas, JavaScript
- **Deployment**: GitHub Pages
- **Features**:
  - Client-side prediction for responsive controls
  - Remote player interpolation for smooth rendering
  - Server reconciliation for position corrections

### Server (Backend)
- **Technology**: Node.js, Express, Socket.io
- **Deployment**: Render (free tier)
- **Features**:
  - Authoritative game state
  - Server-side AI for bots
  - Room management with unique codes
  - Seed-based obstacle generation for consistency

### Shared Code
- Constants and configuration
- Obstacle generation logic
- Utility functions (collision detection, angle math)

## Project Structure

```
/Tank_Shooter_Multiplayer
├── /client                 # Frontend (GitHub Pages)
│   ├── index.html
│   ├── game.js
│   ├── networkManager.js
│   └── styles.css
├── /server                 # Backend (Render)
│   ├── server.js          # Main entry point
│   ├── roomManager.js     # Room lifecycle
│   ├── room.js            # Game room state
│   ├── gameServer.js      # Authoritative game logic
│   ├── aiController.js    # Server-side AI
│   └── package.json
├── /shared                 # Shared between client/server
│   ├── constants.js
│   └── gameLogic.js
├── render.yaml
└── README.md
```

## Local Development

### Prerequisites
- Node.js 18+
- npm or yarn
- Git

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd Tank_Shooter_Multiplayer
   ```

2. **Install server dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```
   Server runs on `http://localhost:3001`

4. **Run the client**
   - Open `client/index.html` in a browser
   - Or use a local server (e.g., `python -m http.server 3000` from client directory)
   - Client expects server at `http://localhost:3001`

5. **Test multiplayer**
   - Open multiple browser windows
   - Click "Create Game" in first window
   - Copy the room code
   - Click "Join Game" in second window and enter the code
   - Start the game and play!

### Development Mode

For auto-restart on code changes:
```bash
cd server
npm run dev
```

## Deployment

### Backend Deployment (Render)

1. **Push code to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Deploy to Render**
   - Go to [render.com](https://render.com)
   - Sign up / Log in
   - Click "New" → "Web Service"
   - Connect your GitHub repository
   - Render will auto-detect `render.yaml`
   - Click "Apply" to deploy

3. **Configure Environment Variables** (if not using render.yaml)
   - `NODE_ENV`: `production`
   - `CLIENT_URL`: Your GitHub Pages URL (e.g., `https://yourusername.github.io/Tank_Shooter_Multiplayer`)

4. **Note your server URL**
   - Will be something like: `https://tank-shooter-server.onrender.com`
   - Free tier spins down after 15 min inactivity (30-60s cold start)

### Frontend Deployment (GitHub Pages)

1. **Update server URL in client**
   - Edit `client/networkManager.js`
   - Replace `'https://your-app.onrender.com'` with your actual Render URL

2. **Update CORS in server**
   - Edit `render.yaml` or environment variables on Render
   - Set `CLIENT_URL` to your GitHub Pages URL

3. **Enable GitHub Pages**
   - Go to repository Settings → Pages
   - Source: Deploy from branch `main`
   - Folder: `/client`
   - Save

4. **Access your game**
   - URL: `https://yourusername.github.io/Tank_Shooter_Multiplayer`
   - May take a few minutes for first deployment

## Controls

- **W**: Move Forward
- **S**: Move Backward
- **A**: Turn Left (reversed when backing up)
- **D**: Turn Right (reversed when backing up)
- **SPACE**: Shoot

## Game Mechanics

### Tanks
- Health: 3 hits to destroy
- Respawn time: Increases with deaths (1s base + 2s per death, max 20s)
- Speed: 5 units/frame
- Rotation: 2 degrees/frame

### Bullets
- Speed: 17 units/frame
- Cooldown: 1 second between shots
- Wrap around screen edges
- Bounce off obstacles

### Obstacles
- Randomly generated walls and blocks
- Consistent across all clients (seed-based)
- Cannot be destroyed

### Teams
- Green Team (Team 1)
- Red Team (Team 2)
- Auto-balanced when players join
- First to 24 kills wins

## Network Architecture

### Client-Side Prediction
- Client predicts own tank movement immediately
- Server corrects position if mismatch detected
- Snap if difference > 50px, smooth lerp if 10-50px

### Server Reconciliation
- Server is authoritative for all game state
- Sends full snapshot every 500ms
- Sends delta updates every 60ms

### Remote Player Interpolation
- Clients render remote players 100ms in past
- Interpolates between last 2 server snapshots
- Smooth, jitter-free movement

### Disconnect Handling
- 5-second grace period before conversion to bot
- Player can reconnect within grace period
- Bot continues playing if disconnected longer

## Troubleshooting

### Client can't connect to server
- Check server is running
- Verify server URL in `networkManager.js`
- Check CORS configuration in `server.js`
- Check browser console for errors

### Players see different obstacle layouts
- Ensure same seed is used (server generates and sends to clients)
- Check that shared `gameLogic.js` is loaded correctly

### Laggy gameplay
- Check network latency (works best <200ms)
- Render free tier may have performance limits
- Try reducing number of concurrent games

### Room codes not working
- Room codes are case-insensitive
- Codes are 6 characters (letters and numbers)
- Rooms expire when all players leave

## Technical Details

### Network Protocol
- Transport: Socket.io (WebSocket + fallback)
- Tick Rate: 60ms (server), 16ms (client)
- Interpolation Delay: 100ms
- Snapshot Rate: 500ms (full), 60ms (delta)

### Anti-Cheat
- Server validates all shooting (cooldown enforcement)
- Server validates all damage events
- Position sanity checks (max speed validation)
- Rate limiting: max 100 inputs/sec per player

### Performance
- Supports 6 players + bots
- Server: ~16 updates/sec
- Client: ~60 FPS rendering
- Bandwidth: ~5-10 KB/sec per player

## Credits

Built with:
- [Socket.io](https://socket.io/) - Real-time communication
- [Express](https://expressjs.com/) - Web server
- HTML5 Canvas - Rendering

## License

MIT License - feel free to modify and use for your own projects!

## Support

For issues, questions, or contributions, please open an issue on GitHub.
