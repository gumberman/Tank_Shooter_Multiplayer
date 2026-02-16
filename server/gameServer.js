const { CONFIG, TEAM_COLORS } = require('../shared/constants');
const { generateObstacles, wrapPosition, normalizeAngle } = require('../shared/gameLogic');
const AIController = require('./aiController');

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

        // Create human player tanks
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
                isPlayer: true,
                isBot: false,
                name: player.name,
                respawning: false,
                respawnTimer: 0,
                respawnTime: 0
            };
            this.tanks.set(tank.id, tank);
        }

        // Fill remaining slots with AI bots (up to 3 per team)
        for (let team = 1; team <= 2; team++) {
            const teamCount = Array.from(this.tanks.values()).filter(t => t.team === team).length;
            const botsNeeded = CONFIG.MAX_TEAM_SIZE - teamCount;

            for (let i = 0; i < botsNeeded; i++) {
                const botId = `bot_${team}_${i}`;
                const spawnPos = this.findSafeSpawn(team);
                const bot = {
                    id: botId,
                    x: spawnPos.x,
                    y: spawnPos.y,
                    rotation: Math.random() * 360,
                    color: TEAM_COLORS[team],
                    team: team,
                    number: tankNumber++,
                    health: CONFIG.MAX_HEALTH,
                    score: 0,
                    deaths: 0,
                    lastShot: 0,
                    isPlayer: false,
                    isBot: true,
                    name: `Bot ${i + 1}`,
                    respawning: false,
                    respawnTimer: 0,
                    respawnTime: 0
                };
                this.tanks.set(bot.id, bot);
            }
        }
    }

    /**
     * Main game update loop
     */
    update() {
        this.tick++;
        const now = Date.now();

        // Process player inputs
        for (const [playerId, inputs] of this.inputBuffers.entries()) {
            if (inputs.length > 0) {
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
     * Move tank forward or backward
     */
    moveTank(tank, direction) {
        const rad = tank.rotation * Math.PI / 180;
        let newX = tank.x + Math.cos(rad) * CONFIG.TANK_SPEED * direction;
        let newY = tank.y + Math.sin(rad) * CONFIG.TANK_SPEED * direction;

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
     * Check if tank can shoot
     */
    canShoot(tank) {
        return Date.now() - tank.lastShot >= CONFIG.SHOOT_COOLDOWN;
    }

    /**
     * Create bullet
     */
    createBullet(tank) {
        const rad = tank.rotation * Math.PI / 180;
        const spawnDist = CONFIG.TANK_SIZE / 2 + CONFIG.BULLET_RADIUS + 5;

        this.bullets.push({
            id: `${tank.id}_${Date.now()}`,
            x: tank.x + Math.cos(rad) * spawnDist,
            y: tank.y + Math.sin(rad) * spawnDist,
            vx: Math.cos(rad) * CONFIG.BULLET_SPEED,
            vy: Math.sin(rad) * CONFIG.BULLET_SPEED,
            ownerId: tank.id,
            team: tank.team,
            createdAt: Date.now()
        });
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

            // Wraparound
            bullet.x = wrapPosition(bullet.x, CONFIG.CANVAS_WIDTH);
            bullet.y = wrapPosition(bullet.y, CONFIG.CANVAS_HEIGHT);

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

            // Check tank collision
            for (const tank of this.tanks.values()) {
                if (tank.id === bullet.ownerId || tank.respawning) continue;

                const dist = Math.hypot(tank.x - bullet.x, tank.y - bullet.y);
                if (dist < CONFIG.TANK_SIZE / 2 + CONFIG.BULLET_RADIUS) {
                    this.handleBulletHit(bullet, tank);
                    bulletsToRemove.push(i);
                    hit = true;
                    break;
                }
            }

            // Remove old bullets (30 seconds)
            if (Date.now() - bullet.createdAt > 30000) {
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
     * Find safe spawn position
     */
    findSafeSpawn(team) {
        const centerX = CONFIG.CANVAS_WIDTH / 2;
        const centerY = CONFIG.CANVAS_HEIGHT / 2;
        const spawnRadius = 300;

        for (let attempt = 0; attempt < 50; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * spawnRadius;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;

            if (this.canMoveTo(x, y, null)) {
                return { x, y };
            }
        }

        // Fallback to center
        return { x: centerX, y: centerY };
    }

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
                isBot: tank.isBot
            })),
            bullets: this.bullets.map(b => ({
                id: b.id,
                x: b.x,
                y: b.y,
                team: b.team
            })),
            teamScores: this.teamScores
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
