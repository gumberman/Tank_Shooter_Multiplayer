# Tank Shooter - Deployment Guide

## Architecture

The server runs locally on this machine and is exposed to the internet via Cloudflare Tunnel.

- **Game server**: Node.js/Express + Socket.io on `localhost:3001`
- **Client files**: Served by the same Express server (from `docs/`)
- **Public access**: Cloudflare Tunnel (`cloudflared`)

---

## Running the Game

Two terminal windows must be open simultaneously.

### Terminal 1 — Game Server

```powershell
cd "D:\Claude Code\Websites\Tank_Shooter\server"
npm start
```

Server runs at `http://localhost:3001`. Open this in your own browser to play locally.

### Terminal 2 — Cloudflare Tunnel

```powershell
cloudflared tunnel --url http://localhost:3001
```

Cloudflare will print a public URL like:
```
https://some-random-words.trycloudflare.com
```

Share this URL with friends. It stays active as long as this terminal is open.

---

## Notes on the Quick Tunnel

- URL is **random and changes** every time you restart cloudflared
- No Cloudflare account login required
- No uptime guarantee (fine for casual play sessions)
- If you want a **permanent URL**, set up a named tunnel with a domain (see below)

---

## Optional: Named Tunnel with a Domain (Permanent URL)

If you have a domain managed in Cloudflare:

```powershell
# Login once
cloudflared tunnel login

# Create a named tunnel
cloudflared tunnel create tank-shooter

# Route a subdomain to it (e.g. tank.yourdomain.com)
cloudflared tunnel route dns tank-shooter tank.yourdomain.com

# Run it
cloudflared tunnel run --url http://localhost:3001 tank-shooter
```

Friends always access the game at `https://tank.yourdomain.com`.

---

## Testing Checklist

- [ ] `npm start` shows server running on port 3001
- [ ] `http://localhost:3001` loads the game in browser
- [ ] `http://localhost:3001/health` returns `{"status":"ok",...}`
- [ ] cloudflared tunnel connects and prints a public URL
- [ ] Friend can open the public URL and join a room
- [ ] Gameplay is smooth (works best with <200ms latency)
- [ ] AI bots fill empty slots correctly

---

## Troubleshooting

**Game doesn't load at the public URL**
- Make sure the server (`npm start`) is running — the tunnel needs something to forward to
- Check server is healthy: `http://localhost:3001/health`

**Players can't connect / Socket.io errors**
- Reload the page — the tunnel URL must match the page origin exactly
- Check browser console for errors

**Players see different maps**
- Check that `shared/gameLogic.js` is loaded
- Check browser console for errors

**Room codes don't work**
- Codes are case-insensitive, exactly 6 characters
- Rooms auto-delete when empty

**Laggy gameplay**
- Check network latency (ping)
- Works best with <200ms latency

---

## Cost

- **cloudflared quick tunnel**: Free
- **Named tunnel**: Free (requires Cloudflare account + domain)

**Total Cost**: $0/month
