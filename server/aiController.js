const { CONFIG } = require('../shared/constants');
const { normalizeAngle, angleDifference } = require('../shared/gameLogic');

/**
 * Simplified AI Controller for server-side bots
 * Much simpler than client AI - just basic combat behavior
 */
class AIController {
    constructor() {
        this.lastInputs = new Map(); // botId -> last input state
    }

    /**
     * Get input for a bot
     * @param {object} bot - The bot tank
     * @param {array} allTanks - All tanks in game
     * @param {array} bullets - All bullets in game
     * @param {array} obstacles - All obstacles
     * @returns {object} Input state {w, a, s, d, space}
     */
    getInput(bot, allTanks, bullets, obstacles) {
        const input = {
            w: false,
            a: false,
            s: false,
            d: false,
            space: false
        };

        // Find nearest enemy
        const nearestEnemy = this.findNearestEnemy(bot, allTanks);

        if (!nearestEnemy) {
            // No enemy, just move forward
            input.w = true;
            return input;
        }

        // Calculate angle to enemy
        const angleToEnemy = Math.atan2(
            nearestEnemy.y - bot.y,
            nearestEnemy.x - bot.x
        ) * 180 / Math.PI;

        const angleDiff = angleDifference(bot.rotation, angleToEnemy);

        // Rotate toward enemy
        if (Math.abs(angleDiff) > 5) {
            if (angleDiff > 0) {
                input.d = true; // Turn right
            } else {
                input.a = true; // Turn left
            }
        }

        // Move forward if roughly facing enemy
        if (Math.abs(angleDiff) < 45) {
            input.w = true;
        }

        // Shoot if facing enemy closely
        const distToEnemy = Math.hypot(nearestEnemy.x - bot.x, nearestEnemy.y - bot.y);
        if (Math.abs(angleDiff) < 30 && distToEnemy < 800) {
            // Check if clear shot (no obstacles in the way)
            if (this.hasClearShot(bot, nearestEnemy, obstacles)) {
                input.space = true;
            }
        }

        // Dodge incoming bullets
        const threatBullet = this.findThreatBullet(bot, bullets);
        if (threatBullet) {
            // Try to move perpendicular to bullet direction
            input.w = false;
            if (Math.random() > 0.5) {
                input.a = true;
            } else {
                input.d = true;
            }
        }

        return input;
    }

    /**
     * Find nearest enemy tank
     */
    findNearestEnemy(bot, allTanks) {
        let nearest = null;
        let minDist = Infinity;

        for (const tank of allTanks) {
            if (tank.id === bot.id || tank.team === bot.team || tank.respawning) {
                continue;
            }

            const dist = Math.hypot(tank.x - bot.x, tank.y - bot.y);
            if (dist < minDist) {
                minDist = dist;
                nearest = tank;
            }
        }

        return nearest;
    }

    /**
     * Check if bot has clear shot to target
     */
    hasClearShot(bot, target, obstacles) {
        const dx = target.x - bot.x;
        const dy = target.y - bot.y;
        const dist = Math.hypot(dx, dy);
        const steps = Math.ceil(dist / 50); // Check every 50px

        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const checkX = bot.x + dx * t;
            const checkY = bot.y + dy * t;

            // Check if this point intersects any obstacle
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
            if (dist < 200) {
                // Check if bullet is heading toward bot
                const toBotAngle = Math.atan2(bot.y - bullet.y, bot.x - bullet.x) * 180 / Math.PI;
                const bulletAngle = Math.atan2(bullet.vy, bullet.vx) * 180 / Math.PI;
                const angleDiff = Math.abs(angleDifference(bulletAngle, toBotAngle));

                if (angleDiff < 45) {
                    return bullet;
                }
            }
        }

        return null;
    }
}

module.exports = AIController;
