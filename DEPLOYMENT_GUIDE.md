# Tank Shooter - Quick Deployment Guide

## ✅ Implementation Complete!

All features from the plan have been successfully implemented:
- ✅ Backend server with Socket.io
- ✅ Client multiplayer support
- ✅ Room-based matchmaking
- ✅ Client-side prediction
- ✅ Server reconciliation
- ✅ Remote player interpolation
- ✅ Server-side AI bots
- ✅ Shared code architecture

## 🚀 Next Steps: Deploy to Production

### Step 1: Create GitHub Repository

1. Go to [GitHub](https://github.com) and create a new repository
   - Name: `Tank_Shooter_Multiplayer` (or your choice)
   - Public or Private
   - Don't initialize with README (we have one)

2. Add remote and push:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Deploy Backend to Render

1. Go to [render.com](https://render.com) and sign up/login

2. Click "New" → "Web Service"

3. Connect your GitHub account and select the repository

4. Render will auto-detect `render.yaml` configuration

5. Click "Apply" to deploy

6. Wait for deployment (2-3 minutes)

7. **Copy your server URL** (e.g., `https://tank-shooter-server.onrender.com`)

### Step 3: Update Client Configuration

1. Edit `client/networkManager.js` line 7:
   ```javascript
   this.serverUrl = window.location.hostname === 'localhost'
       ? 'http://localhost:3001'
       : 'https://YOUR-RENDER-URL.onrender.com'; // Replace with actual URL
   ```

2. Commit and push:
   ```bash
   git add client/networkManager.js
   git commit -m "Update production server URL"
   git push
   ```

### Step 4: Update Server CORS

1. On Render dashboard, go to your service

2. Go to "Environment" tab

3. Update `CLIENT_URL` to your GitHub Pages URL:
   ```
   https://YOUR_USERNAME.github.io/Tank_Shooter_Multiplayer
   ```

4. Save and redeploy

### Step 5: Deploy Frontend to GitHub Pages

1. Go to your repository on GitHub

2. Settings → Pages

3. Configure:
   - Source: "Deploy from a branch"
   - Branch: `main`
   - Folder: `/client`

4. Save

5. Wait 1-2 minutes for deployment

6. Access your game at:
   ```
   https://YOUR_USERNAME.github.io/Tank_Shooter_Multiplayer
   ```

## 🧪 Testing Checklist

### Local Testing (Before Deployment)

1. **Start server**:
   ```bash
   cd server
   npm start
   ```

2. **Open client**:
   - Open `client/index.html` in browser
   - Or run: `python -m http.server 3000` from client directory

3. **Test multiplayer**:
   - [ ] Create a room
   - [ ] Copy room code
   - [ ] Open another browser window
   - [ ] Join the room
   - [ ] Start game
   - [ ] Verify smooth gameplay
   - [ ] Check AI bots fill empty slots

### Production Testing (After Deployment)

1. **Test server health**:
   - Visit: `https://YOUR-RENDER-URL.onrender.com/health`
   - Should return: `{"status":"ok",...}`

2. **Test multiplayer**:
   - [ ] Visit GitHub Pages URL
   - [ ] Create a room (may have 30s cold start first time)
   - [ ] Share room code with friend
   - [ ] Play together
   - [ ] Check for lag/issues

3. **Test practice mode**:
   - [ ] Click "Practice Mode"
   - [ ] Verify AI works correctly
   - [ ] Game should work entirely offline

## 📊 Monitoring

### Render Dashboard
- View logs: `https://dashboard.render.com`
- Check for errors in server logs
- Monitor response times

### Common Issues

**Server slow to respond**
- Free tier spins down after 15 min inactivity
- First request after spindown takes 30-60s
- Solution: Upgrade to paid tier or accept cold starts

**CORS errors**
- Check CLIENT_URL environment variable
- Must match exact GitHub Pages URL
- Include https:// prefix

**Room codes not working**
- Check server logs for errors
- Verify Socket.io connection established
- Check browser console for errors

## 💰 Cost Breakdown

- **GitHub Pages**: Free
- **Render Free Tier**: Free (with limitations)
  - 750 hours/month
  - Spins down after 15 min inactivity
  - 512 MB RAM
  - Shared CPU

**Total Cost**: $0/month

## 🔄 Updates and Maintenance

### Updating the Game

1. Make changes locally
2. Test locally
3. Commit and push:
   ```bash
   git add .
   git commit -m "Description of changes"
   git push
   ```

### Server Updates
- Render auto-deploys on push to main branch
- Check deployment status in Render dashboard

### Client Updates
- GitHub Pages auto-deploys on push to main branch
- May take 1-2 minutes to reflect changes

## 🎮 Sharing Your Game

Once deployed, share this link with friends:
```
https://YOUR_USERNAME.github.io/Tank_Shooter_Multiplayer
```

They can:
1. Click "Create Game" to host
2. Or click "Join Game" and enter your room code
3. Play together instantly!

## 🐛 Troubleshooting

**Problem**: Client can't connect to server
- Check server URL in networkManager.js
- Check CORS settings
- Check server is running (visit /health endpoint)

**Problem**: Players see different maps
- Should not happen - obstacles use server seed
- Check that shared/gameLogic.js is loaded
- Check browser console for errors

**Problem**: Laggy gameplay
- Check network latency (ping)
- Works best with <200ms latency
- Free tier may have performance limits

**Problem**: Room codes don't work
- Codes are case-insensitive
- Must be exactly 6 characters
- Rooms auto-delete when empty

## 📚 Additional Resources

- [Render Documentation](https://render.com/docs)
- [GitHub Pages Documentation](https://docs.github.com/pages)
- [Socket.io Documentation](https://socket.io/docs/)

## 🎉 You're Done!

Your multiplayer Tank Shooter game is now live and ready to play!

Enjoy the game! 🎮
