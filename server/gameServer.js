const { CONFIG, TEAM_COLORS } = require('../shared/constants');
const { generateObstacles, wrapPosition, normalizeAngle } = require('../shared/gameLogic');
const AIController = require('./aiController');

const POWERUP_TYPES = ['FASTER_RELOAD', 'SPEED_BOOST', 'LARGE_PROJECTILE'];

class GameServer {
    constructor(room, io) {
        this.room = room;
        this.io = io;
        this.tanks = new Map(); // tankId -> tank
        this.bullets = [];
        this.obstacles = [];
        this.teamScores = { 1: 0, 2: 0 };
        this.tick = 0;
        this.lastSnapshotTime = 0;
        this.updateInterval = null;
        this.inputBuffers = new Map(); // playerId -> [inputs]
        this.aiController = new AIController();
        this.gameStartTime = Date.now();

        // Power-up state
        this.powerups = [];
        this.powerupIdCounter = 0;
        this.nextPowerupTime = Date.now() + this._randomSpawnDelay();
    }

    _randomSpawnDelay() {
        return CONFIG.POWERUP_MIN_SPAWN + Math.random() * (CONFIG.POWERUP_MAX_SPAWN - CONFIG.POWERUP_MIN_SPAWN);
    }

    /**
     * Start the game server
     */
    start() {
        // Generate obstacles using room seed
        this.obstacles = generateObstacles(this.room.seed);

        // Initialize tanks (players + AI)
        this.initializeTanks();

        // Start game loop
        this.updateInterval = setInterval(() => {
            this.update();
        }, CONFIG.SERVER_TICK_RATE);

        console.log(`[${new Date().toISOString()}] Game server started for room: ${this.room.code}`);
    }

    /**
     * Stop the game server
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        console.log(`[${new Date().toISOString()}] Game server stopped for room: ${this.room.code}`);
    }

    /**
     * Initialize tanks (human players + AI bots)
     */
    initializeTanks() {
        const players = this.room.getPlayerList();
        let tankNumber = 1;

        // Create tanks for all players (including lobby bots)
        for (const player of players) {
            const spawnPos = this.findSafeSpawn(player.team);
            const tank = {
                id: player.id,
                x: spawnPos.x,
                y: spawnPos.y,
                rotation: Math.random() * 360,
                color: TEAM_COLORS[player.team],
                team: player.team,
                number: tankNumber++,
                health: CONFIG.MAX_HEALTH,
                score: 0,
                deaths: 0,
                lastShot: 0,
                isPlayer: !player.isBot,
                isBot: player.isBot || false,
                name: player.name,
                respawning: false,
                respawnTimer: 0,
                respawnTime: 0,
                activePowerups: []
            };
            this.tanks.set(tank.id, tank);
        }
    }

    /**
     * Main game update loop
     */
    update() {
        this.tick++;
        const now = Date.now();

        // Process player inputs - drain all buffered inputs per tick
        for (const [playerId, inputs] of this.inputBuffers.entries()) {
            while (inputs.length > 0) {
                const input = inputs.shift();
                this.processInput(playerId, input);
            }
        }

        // Update AI bots
        this.updateBots();

        // Update respawn timers
        this.updateRespawnTimers();

        // Update bullets
        this.updateBullets();

        // Update power-ups (spawn, collect, expire)
        this.updatePowerups(now);

        // Check win condition
        this.checkWinCondition();

        // Broadcast state
        this.broadcastState(now);
    }

    /**
     * Process player input
     */
    processPlayerInput(playerId, inputData) {
        if (!this.inputBuffers.has(playerId)) {
            this.inputBuffers.set(playerId, []);
        }
        this.inputBuffers.get(playerId).push(inputData);
    }

    /**
     * Process single input
     */
    processInput(tankId, input) {
        const tank = this.tanks.get(tankId);
        if (!tank || tank.respawning) return;

        const { w, a, s, d, space } = input.input;

        // Rotation
        if (a) {
            tank.rotation = normalizeAngle(tank.rotation - CONFIG.ROTATION_SPEED);
        }
        if (d) {
            tank.rotation = normalizeAngle(tank.rotation + CONFIG.ROTATION_SPEED);
        }

        // Movement
        if (w) {
            this.moveTank(tank, 1);
        }
        if (s) {
            this.moveTank(tank, -1);
        }

        // Shooting
        if (space && this.canShoot(tank)) {
            this.createBullet(tank);
            tank.lastShot = Date.now();
        }
    }

    /**
     * Edge speed modifier - matches client physics
     */
    getEdgeSpeedModifier(tank) {
        const edgeThreshold = 200;
        const minDistX = Math.min(tank.x, CONFIG.CANVAS_WIDTH - tank.x);
        const minDistY = Math.min(tank.y, CONFIG.CANVAS_HEIGHT - tank.y);
        const minDist = Math.min(minDistX, minDistY);
        return minDist < edgeThreshold ? 0.75 : 1.0;
    }

    /**
     * Get speed multiplier from active powerups
     */
    getSpeedMultiplier(tank) {
        const now = Date.now();
        if (tank.activePowerups) {
            const boost = tank.activePowerups.find(p => p.type === 'SPEED_BOOST' && p.expiresAt > now);
            if (boost) return CONFIG.SPEED_BOOST_MULTIPLIER;
        }
        return 1.0;
    }

    /**
     * Move tank forward or backward - matches client physics exactly
     */
    moveTank(tank, direction) {
        const rad = tank.rotation * Math.PI / 180;
        const speedModifier = this.getEdgeSpeedModifier(tank);
        const speedMultiplier = this.getSpeedMultiplier(tank);
        const speed = direction === 1
            ? CONFIG.TANK_SPEED * speedModifier * speedMultiplier
            : CONFIG.TANK_SPEED * 0.65 * speedModifier * speedMultiplier;
        let newX = tank.x + Math.cos(rad) * speed * direction;
        let newY = tank.y + Math.sin(rad) * speed * direction;

        // Wraparound at edges
        newX = wrapPosition(newX, CONFIG.CANVAS_WIDTH);
        newY = wrapPosition(newY, CONFIG.CANVAS_HEIGHT);

        // Check collisions
        if (this.canMoveTo(newX, newY, tank.id)) {
            tank.x = newX;
            tank.y = newY;
        }
    }

    /**
     * Check if tank can move to position
     */
    canMoveTo(x, y, tankId) {
        const size = CONFIG.TANK_SIZE;

        // Check obstacle collision
        for (const obs of this.obstacles) {
            if (x + size/2 > obs.x &&
                x - size/2 < obs.x + obs.width &&
                y + size/2 > obs.y &&
                y - size/2 < obs.y + obs.height) {
                return false;
            }
        }

        // Check tank collision
        for (const [id, otherTank] of this.tanks.entries()) {
            if (id === tankId || otherTank.respawning) continue;

            const dist = Math.hypot(otherTank.x - x, otherTank.y - y);
            if (dist < CONFIG.TANK_SIZE) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if tank can shoot (respects faster reload powerup)
     */
    canShoot(tank) {
        let cooldown = CONFIG.SHOOT_COOLDOWN;
        const now = Date.now();
        if (tank.activePowerups) {
            const faster = tank.activePowerups.find(p => p.type === 'FASTER_RELOAD' && p.expiresAt > now);
            if (faster) cooldown = Math.round(CONFIG.SHOOT_COOLDOWN * CONFIG.FASTER_RELOAD_MULTIPLIER);
        }
        return now - tank.lastShot >= cooldown;
    }

    /**
     * Create bullet - applies recoil to shooter (collision-safe)
     */
    createBullet(tank) {
        const rad = tank.rotation * Math.PI / 180;
        const now = Date.now();

        // Check for large projectile powerup
        let bulletRadius = CONFIG.BULLET_RADIUS;
        if (tank.activePowerups) {
            const large = tank.activePowerups.find(p => p.type === 'LARGE_PROJECTILE' && p.expiresAt > now);
            if (large) bulletRadius = Math.round(CONFIG.BULLET_RADIUS * CONFIG.LARGE_PROJECTILE_MULTIPLIER);
        }

        const spawnDist = CONFIG.TANK_SIZE / 2 + bulletRadius + 5;

        this.bullets.push({
            id: `${tank.id}_${now}`,
            x: tank.x + Math.cos(rad) * spawnDist,
            y: tank.y + Math.sin(rad) * spawnDist,
            vx: Math.cos(rad) * CONFIG.BULLET_SPEED,
            vy: Math.sin(rad) * CONFIG.BULLET_SPEED,
            ownerId: tank.id,
            team: tank.team,
            radius: bulletRadius,
            createdAt: now
        });

        // Apply recoil - push tank backwards if the position is valid
        const recoilDistance = 15;
        const recoilX = tank.x - Math.cos(rad) * recoilDistance;
        const recoilY = tank.y - Math.sin(rad) * recoilDistance;
        // Wrap recoil position and check collision
        const wrappedRecoilX = wrapPosition(recoilX, CONFIG.CANVAS_WIDTH);
        const wrappedRecoilY = wrapPosition(recoilY, CONFIG.CANVAS_HEIGHT);
        if (this.canMoveTo(wrappedRecoilX, wrappedRecoilY, tank.id)) {
            tank.x = wrappedRecoilX;
            tank.y = wrappedRecoilY;
        }
    }

    /**
     * Update AI bots
     */
    updateBots() {
        for (const [id, tank] of this.tanks.entries()) {
            if (tank.isBot && !tank.respawning) {
                const input = this.aiController.getInput(
                    tank,
                    Array.from(this.tanks.values()),
                    this.bullets,
                    this.obstacles
                );
                this.processInput(id, { input });
            }
        }
    }

    /**
     * Update respawn timers
     */
    updateRespawnTimers() {
        const now = Date.now();
        for (const tank of this.tanks.values()) {
            if (tank.respawning && now >= tank.respawnTime) {
                this.respawnTank(tank);
            }
        }
    }

    /**
     * Update bullets
     */
    updateBullets() {
        const bulletsToRemove = [];

        for (let i = 0; i < this.bullets.length; i++) {
            const bullet = this.bullets[i];

            // Update position
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;

            // Remove bullets that leave the map
            if (bullet.x < 0 || bullet.x > CONFIG.CANVAS_WIDTH ||
                bullet.y < 0 || bullet.y > CONFIG.CANVAS_HEIGHT) {
                bulletsToRemove.push(i);
                continue;
            }

            // Check obstacle collision
            let hit = false;
            for (const obs of this.obstacles) {
                if (bullet.x > obs.x && bullet.x < obs.x + obs.width &&
                    bullet.y > obs.y && bullet.y < obs.y + obs.height) {
                    hit = true;
                    break;
                }
            }

            if (hit) {
                bulletsToRemove.push(i);
                continue;
            }

            // Check tank collision (use bullet's own radius)
            const bulletHitRadius = (bullet.radius || CONFIG.BULLET_RADIUS);
            for (const tank of this.tanks.values()) {
                if (tank.id === bullet.ownerId || tank.team === bullet.team || tank.respawning) continue;

                const dist = Math.hypot(tank.x - bullet.x, tank.y - bullet.y);
                if (dist < CONFIG.TANK_SIZE / 2 + bulletHitRadius) {
                    this.handleBulletHit(bullet, tank);
                    bulletsToRemove.push(i);
                    hit = true;
                    break;
                }
            }

            // Remove old bullets (30 seconds)
            if (!hit && Date.now() - bullet.createdAt > 30000) {
                bulletsToRemove.push(i);
            }
        }

        // Remove bullets (reverse order to maintain indices)
        for (let i = bulletsToRemove.length - 1; i >= 0; i--) {
            this.bullets.splice(bulletsToRemove[i], 1);
        }
    }

    /**
     * Handle bullet hitting tank
     */
    handleBulletHit(bullet, tank) {
        tank.health--;

        if (tank.health <= 0) {
            // Tank destroyed
            const shooter = this.tanks.get(bullet.ownerId);
            if (shooter) {
                shooter.score++;
                this.teamScores[shooter.team]++;
            }

            tank.deaths++;
            tank.respawning = true;
            tank.health = 0;
            tank.activePowerups = []; // Clear powerups on death

            // Calculate respawn time
            const respawnDelay = Math.min(
                CONFIG.BASE_RESPAWN_TIME + tank.deaths * CONFIG.RESPAWN_INCREMENT,
                CONFIG.MAX_RESPAWN_TIME
            );
            tank.respawnTimer = respawnDelay;
            tank.respawnTime = Date.now() + respawnDelay;
        }
    }

    /**
     * Respawn tank
     */
    respawnTank(tank) {
        tank.health = CONFIG.MAX_HEALTH;
        tank.respawning = false;
        tank.respawnTimer = 0;
        tank.respawnTime = 0;

        const spawnPos = this.findSafeSpawn(tank.team);
        tank.x = spawnPos.x;
        tank.y = spawnPos.y;
        tank.rotation = Math.random() * 360;
    }

    /**
     * Find safe spawn position anywhere on the map
     */
    findSafeSpawn(team) {
        const margin = CONFIG.TANK_SIZE * 2;

        for (let attempt = 0; attempt < 100; attempt++) {
            const x = margin + Math.random() * (CONFIG.CANVAS_WIDTH - margin * 2);
            const y = margin + Math.random() * (CONFIG.CANVAS_HEIGHT - margin * 2);

            if (this.canMoveTo(x, y, null)) {
                return { x, y };
            }
        }

        // Fallback to center
        return { x: CONFIG.CANVAS_WIDTH / 2, y: CONFIG.CANVAS_HEIGHT / 2 };
    }

    // ============================================
    // POWER-UP SYSTEM
    // ============================================

    /**
     * Spawn, collect, and expire power-ups
     */
    updatePowerups(now) {
        // Expire powerup buffs on tanks
        for (const tank of this.tanks.values()) {
            if (tank.activePowerups && tank.activePowerups.length > 0) {
                tank.activePowerups = tank.activePowerups.filter(p => p.expiresAt > now);
            }
        }

        // Spawn new powerup if timer elapsed and below max count
        if (now >= this.nextPowerupTime && this.powerups.length < CONFIG.POWERUP_MAX_COUNT) {
            const pos = this.findSafePowerupSpawn();
            if (pos) {
                const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
                this.powerups.push({
                    id: `pu_${++this.powerupIdCounter}`,
                    type,
                    x: pos.x,
                    y: pos.y,
                    createdAt: now
                });
            }
            // Always schedule next regardless of whether spawn succeeded
            this.nextPowerupTime = now + this._randomSpawnDelay();
        }

        // Check collection - tank walks over powerup
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const pu = this.powerups[i];
            for (const tank of this.tanks.values()) {
                if (tank.respawning) continue;
                const dist = Math.hypot(tank.x - pu.x, tank.y - pu.y);
                if (dist < CONFIG.POWERUP_RADIUS + CONFIG.TANK_SIZE / 2) {
                    this.applyPowerup(tank, pu.type, now);
                    this.powerups.splice(i, 1);
                    break;
                }
            }
        }
    }

    /**
     * Find a safe position for a power-up (not on obstacles, not near tanks)
     */
    findSafePowerupSpawn() {
        const margin = 200;
        const r = CONFIG.POWERUP_RADIUS;

        for (let attempt = 0; attempt < 100; attempt++) {
            const x = margin + Math.random() * (CONFIG.CANVAS_WIDTH - margin * 2);
            const y = margin + Math.random() * (CONFIG.CANVAS_HEIGHT - margin * 2);

            // Check not overlapping obstacle
            let blocked = false;
            for (const obs of this.obstacles) {
                if (x + r > obs.x && x - r < obs.x + obs.width &&
                    y + r > obs.y && y - r < obs.y + obs.height) {
                    blocked = true;
                    break;
                }
            }
            if (blocked) continue;

            // Check not too close to any tank
            let tooClose = false;
            for (const tank of this.tanks.values()) {
                if (Math.hypot(tank.x - x, tank.y - y) < CONFIG.POWERUP_MIN_TANK_DIST) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;

            return { x, y };
        }
        return null; // Could not find valid position this tick
    }

    /**
     * Apply a powerup to a tank
     */
    applyPowerup(tank, type, now) {
        if (!tank.activePowerups) tank.activePowerups = [];
        // Replace existing buff of same type (refresh duration)
        tank.activePowerups = tank.activePowerups.filter(p => p.type !== type);
        tank.activePowerups.push({ type, expiresAt: now + CONFIG.POWERUP_DURATION });
    }

    // ============================================

    /**
     * Convert player to bot (on disconnect)
     */
    convertPlayerToBot(playerId) {
        const tank = this.tanks.get(playerId);
        if (tank) {
            tank.isBot = true;
            tank.isPlayer = false;
            tank.name = `Bot (${tank.name})`;
        }
    }

    /**
     * Check win condition
     */
    checkWinCondition() {
        if (this.teamScores[1] >= CONFIG.WIN_SCORE || this.teamScores[2] >= CONFIG.WIN_SCORE) {
            const winningTeam = this.teamScores[1] >= CONFIG.WIN_SCORE ? 1 : 2;
            this.endGame(winningTeam);
        }
    }

    /**
     * End the game
     */
    endGame(winningTeam) {
        this.stop();

        const stats = Array.from(this.tanks.values()).map(tank => ({
            name: tank.name,
            team: tank.team,
            score: tank.score,
            deaths: tank.deaths
        }));

        this.room.endGame(winningTeam, this.teamScores, stats);
    }

    /**
     * Broadcast game state to clients
     */
    broadcastState(now) {
        const isFullSnapshot = now - this.lastSnapshotTime >= CONFIG.SNAPSHOT_RATE;

        const state = {
            tick: this.tick,
            timestamp: now,
            tanks: Array.from(this.tanks.values()).map(tank => ({
                id: tank.id,
                x: tank.x,
                y: tank.y,
                rotation: tank.rotation,
                health: tank.health,
                score: tank.score,
                deaths: tank.deaths,
                respawning: tank.respawning,
                respawnTimer: tank.respawning ? tank.respawnTime - now : 0,
                team: tank.team,
                name: tank.name,
                isBot: tank.isBot,
                activePowerups: tank.activePowerups || []
            })),
            bullets: this.bullets.map(b => ({
                id: b.id,
                x: b.x,
                y: b.y,
                team: b.team,
                radius: b.radius
            })),
            teamScores: this.teamScores,
            powerups: this.powerups.map(p => ({
                id: p.id,
                type: p.type,
                x: p.x,
                y: p.y
            }))
        };

        if (isFullSnapshot) {
            state.obstacles = this.obstacles;
            state.fullSnapshot = true;
            this.lastSnapshotTime = now;
        }

        this.io.to(this.room.code).emit('gameState', state);
    }
}

module.exports = GameServer;
