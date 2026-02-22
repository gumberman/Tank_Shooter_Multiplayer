const { CONFIG } = require('../shared/constants');
const { normalizeAngle, angleDifference } = require('../shared/gameLogic');

/**
 * Simplified AI Controller for server-side bots
 * Uses smart target switching instead of complex pathfinding
 */
class AIController {
    constructor() {
        this.positionHistory = new Map(); // botId -> {x, y, time}
        this.currentTarget = new Map(); // botId -> {type, id, until}
    }

    /**
     * Shortest wrapped distance between two points
     */
    wrappedDist(x1, y1, x2, y2) {
        let dx = Math.abs(x2 - x1);
        let dy = Math.abs(y2 - y1);
        if (dx > CONFIG.CANVAS_WIDTH / 2) dx = CONFIG.CANVAS_WIDTH - dx;
        if (dy > CONFIG.CANVAS_HEIGHT / 2) dy = CONFIG.CANVAS_HEIGHT - dy;
        return Math.hypot(dx, dy);
    }

    /**
     * Angle toward target using shortest wrapped path
     */
    wrappedAngle(fromX, fromY, toX, toY) {
        let dx = toX - fromX;
        let dy = toY - fromY;
        if (dx > CONFIG.CANVAS_WIDTH / 2) dx -= CONFIG.CANVAS_WIDTH;
        if (dx < -CONFIG.CANVAS_WIDTH / 2) dx += CONFIG.CANVAS_WIDTH;
        if (dy > CONFIG.CANVAS_HEIGHT / 2) dy -= CONFIG.CANVAS_HEIGHT;
        if (dy < -CONFIG.CANVAS_HEIGHT / 2) dy += CONFIG.CANVAS_HEIGHT;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }

    /**
     * Direct (non-wrapped) distance
     */
    directDist(x1, y1, x2, y2) {
        return Math.hypot(x2 - x1, y2 - y1);
    }

    /**
     * Check if bot is stuck (hasn't moved much recently and hasn't dealt damage)
     */
    isStuck(bot) {
        const now = Date.now();
        const stuckTime = 800; // Must not move for 800ms
        const noDamageTime = 3000; // And no damage dealt in 3s

        // Check damage condition
        const lastDamage = bot.lastDamageDealt || 0;
        if (now - lastDamage < noDamageTime) {
            return false; // Recently dealt damage, not stuck
        }

        // Check movement
        let lastPos = this.positionHistory.get(bot.id);
        if (!lastPos) {
            this.positionHistory.set(bot.id, { x: bot.x, y: bot.y, time: now });
            return false;
        }

        const moved = this.directDist(lastPos.x, lastPos.y, bot.x, bot.y);

        // If moved significantly, update position
        if (moved > 20) {
            this.positionHistory.set(bot.id, { x: bot.x, y: bot.y, time: now });
            return false;
        }

        // Check if enough time has passed
        return (now - lastPos.time) > stuckTime;
    }

    /**
     * Find all enemies sorted by distance
     */
    findEnemies(bot, allTanks) {
        const enemies = [];
        for (const tank of allTanks) {
            if (tank.id === bot.id || tank.team === bot.team || tank.respawning) {
                continue;
            }
            const dist = this.wrappedDist(bot.x, bot.y, tank.x, tank.y);
            enemies.push({ tank, dist });
        }
        enemies.sort((a, b) => a.dist - b.dist);
        return enemies;
    }

    /**
     * Find nearest powerup
     */
    findNearestPowerup(bot, powerups) {
        if (!powerups || powerups.length === 0) return null;

        let nearest = null;
        let minDist = Infinity;

        for (const powerup of powerups) {
            const dist = this.wrappedDist(bot.x, bot.y, powerup.x, powerup.y);
            if (dist < minDist) {
                minDist = dist;
                nearest = { powerup, dist };
            }
        }

        return nearest;
    }

    /**
     * Choose a new target when stuck
     */
    chooseAlternateTarget(bot, allTanks, powerups) {
        const enemies = this.findEnemies(bot, allTanks);
        const nearestPowerup = this.findNearestPowerup(bot, powerups);

        // Build list of potential targets
        const targets = [];

        // Add powerup if exists
        if (nearestPowerup) {
            targets.push({
                type: 'powerup',
                x: nearestPowerup.powerup.x,
                y: nearestPowerup.powerup.y,
                dist: nearestPowerup.dist,
                id: nearestPowerup.powerup.id
            });
        }

        // Add enemies (skip the first/nearest one we're probably stuck on)
        for (let i = 1; i < enemies.length && i < 3; i++) {
            targets.push({
                type: 'enemy',
                x: enemies[i].tank.x,
                y: enemies[i].tank.y,
                dist: enemies[i].dist,
                id: enemies[i].tank.id
            });
        }

        // If no alternate targets, just pick any enemy
        if (targets.length === 0 && enemies.length > 0) {
            return {
                type: 'enemy',
                x: enemies[0].tank.x,
                y: enemies[0].tank.y,
                id: enemies[0].tank.id
            };
        }

        // Pick closest alternate target
        targets.sort((a, b) => a.dist - b.dist);
        return targets[0] || null;
    }

    /**
     * Get current target for bot
     */
    getTarget(bot, allTanks, powerups) {
        const now = Date.now();
        let target = this.currentTarget.get(bot.id);

        // Check if we need a new target
        const needNewTarget = !target ||
            now > target.until ||
            (target.type === 'powerup' && !powerups.find(p => p.id === target.id)) ||
            (target.type === 'enemy' && !allTanks.find(t => t.id === target.id && !t.respawning));

        if (this.isStuck(bot) || needNewTarget) {
            const newTarget = this.chooseAlternateTarget(bot, allTanks, powerups);
            if (newTarget) {
                // Lock onto this target for 2 seconds
                this.currentTarget.set(bot.id, {
                    ...newTarget,
                    until: now + 2000
                });
                // Reset position history when switching targets
                this.positionHistory.set(bot.id, { x: bot.x, y: bot.y, time: now });
                return newTarget;
            }
        }

        // Return current target or default to nearest enemy
        if (target && now < target.until) {
            // Update target position if it's an enemy (they move)
            if (target.type === 'enemy') {
                const enemy = allTanks.find(t => t.id === target.id);
                if (enemy && !enemy.respawning) {
                    target.x = enemy.x;
                    target.y = enemy.y;
                }
            }
            return target;
        }

        // Default: nearest enemy
        const enemies = this.findEnemies(bot, allTanks);
        if (enemies.length > 0) {
            return {
                type: 'enemy',
                x: enemies[0].tank.x,
                y: enemies[0].tank.y,
                id: enemies[0].tank.id
            };
        }

        return null;
    }

    /**
     * Get input for a bot
     */
    getInput(bot, allTanks, bullets, obstacles, powerups = []) {
        const input = { w: false, a: false, s: false, d: false, space: false };

        const target = this.getTarget(bot, allTanks, powerups);
        if (!target) {
            input.w = true;
            return input;
        }

        // Navigate toward target
        const angleToTarget = this.wrappedAngle(bot.x, bot.y, target.x, target.y);
        const angleDiff = angleDifference(bot.rotation, angleToTarget);

        // Rotate toward target
        if (Math.abs(angleDiff) > 5) {
            if (angleDiff > 0) {
                input.d = true;
            } else {
                input.a = true;
            }
        }

        // Move forward if roughly facing target
        if (Math.abs(angleDiff) < 60) {
            input.w = true;
        }

        // Shooting - only at enemies within direct line of sight
        if (target.type === 'enemy') {
            const directDist = this.directDist(bot.x, bot.y, target.x, target.y);
            if (Math.abs(angleDiff) < 25 && directDist < 900) {
                if (this.hasClearShot(bot, target, obstacles)) {
                    input.space = true;
                }
            }
        }

        // Dodge incoming bullets
        const threatBullet = this.findThreatBullet(bot, bullets);
        if (threatBullet) {
            input.w = false;
            // Dodge away from bullet
            const bulletSide = (threatBullet.x - bot.x) * Math.sin(bot.rotation * Math.PI / 180) -
                               (threatBullet.y - bot.y) * Math.cos(bot.rotation * Math.PI / 180);
            if (bulletSide > 0) {
                input.a = true;
                input.d = false;
            } else {
                input.d = true;
                input.a = false;
            }
        }

        return input;
    }

    /**
     * Check if bot has clear shot to target
     */
    hasClearShot(bot, target, obstacles) {
        const dx = target.x - bot.x;
        const dy = target.y - bot.y;
        const dist = Math.hypot(dx, dy);
        const steps = Math.ceil(dist / 50);

        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const checkX = bot.x + dx * t;
            const checkY = bot.y + dy * t;

            for (const obs of obstacles) {
                if (checkX > obs.x && checkX < obs.x + obs.width &&
                    checkY > obs.y && checkY < obs.y + obs.height) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Find threatening bullet nearby
     */
    findThreatBullet(bot, bullets) {
        for (const bullet of bullets) {
            if (bullet.team === bot.team) continue;

            const dist = Math.hypot(bullet.x - bot.x, bullet.y - bot.y);
            if (dist < 150) {
                const toBotAngle = Math.atan2(bot.y - bullet.y, bot.x - bullet.x) * 180 / Math.PI;
                const bulletAngle = Math.atan2(bullet.vy, bullet.vx) * 180 / Math.PI;
                const diff = Math.abs(angleDifference(bulletAngle, toBotAngle));

                if (diff < 30) {
                    return bullet;
                }
            }
        }

        return null;
    }

    /**
     * Clean up state for a bot
     */
    removeBot(botId) {
        this.positionHistory.delete(botId);
        this.currentTarget.delete(botId);
    }
}

module.exports = AIController;
