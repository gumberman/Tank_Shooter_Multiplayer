# Tank Shooter - Deployment Guide

## Architecture

The game server runs on Render.com (Frankfurt region) and serves both the game client and multiplayer backend from a single URL.

- **Game server**: Node.js/Express + Socket.io
- **Client files**: Served by the same Express server (from `docs/`)
- **Hosting**: Render.com free tier, Frankfurt region
- **Game URL**: https://tank-shooter-server.onrender.com

---

## Playing the Game

Share this URL with friends:
```
https://tank-shooter-server.onrender.com
```

- Click **Create Game** to host a room, share the room code
- Click **Join Game** and enter a room code to join
- Click **Practice Mode** to play solo with AI bots (no server needed)

Note: The free tier spins down after 15 min of inactivity. The first load after idle takes ~30 seconds — just wait for it.

---

## Updating the Game

1. Make and test changes locally (see Local Development below)
2. Commit and push:
```bash
git add .
git commit -m "Description of changes"
git push
```
3. Render auto-deploys on push to main — takes ~2 minutes

---

## Local Development

To run and test locally:

### Terminal 1 — Game Server
```powershell
cd "D:\Claude Code\Websites\Tank_Shooter\server"
node server.js
```
Open `http://localhost:3001` in your browser.

### Testing with friends locally (optional)
If you want others to join while running locally, use a Cloudflare quick tunnel:
```powershell
cloudflared tunnel --url http://localhost:3001
```
Share the `trycloudflare.com` URL it prints. Keep both terminals open while playing.

---

## Render Dashboard

- Dashboard: https://dashboard.render.com
- Health check: https://tank-shooter-server.onrender.com/health
- Logs: visible in Render dashboard under your service

---

## Re-deploying from Scratch

If the Render service needs to be recreated:

1. Delete the existing service in Render dashboard (Settings → Delete Service)
2. New → Web Service → connect `Tank_Shooter_Multiplayer` repo
3. Render auto-detects `render.yaml` (Frankfurt region, correct build/start commands)
4. Click Deploy

---

## Troubleshooting

**Game takes 30+ seconds to load**
- Free tier cold start — normal after 15 min idle
- Upgrade to paid tier to eliminate cold starts

**Players can't connect**
- Check health endpoint: https://tank-shooter-server.onrender.com/health
- Check Render logs for errors

**Players see different maps**
- Check browser console for errors loading `shared/gameLogic.js`

**Room codes don't work**
- Codes are case-insensitive, exactly 6 characters
- Rooms auto-delete when empty

---

## Cost

- **Render free tier**: Free
  - 750 hours/month
  - Spins down after 15 min inactivity
  - Frankfurt region (~30-60ms from Israel)

**Total Cost**: $0/month
