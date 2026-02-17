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
     * Shortest wrapped distance between two points on toroidal map
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
        // Take shortest path through map wrapping
        if (dx > CONFIG.CANVAS_WIDTH / 2) dx -= CONFIG.CANVAS_WIDTH;
        if (dx < -CONFIG.CANVAS_WIDTH / 2) dx += CONFIG.CANVAS_WIDTH;
        if (dy > CONFIG.CANVAS_HEIGHT / 2) dy -= CONFIG.CANVAS_HEIGHT;
        if (dy < -CONFIG.CANVAS_HEIGHT / 2) dy += CONFIG.CANVAS_HEIGHT;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }

    /**
     * Direct (non-wrapped) distance between two points
     */
    directDist(x1, y1, x2, y2) {
        return Math.hypot(x2 - x1, y2 - y1);
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

        // Find nearest enemy (wrapping-aware)
        const nearestEnemy = this.findNearestEnemy(bot, allTanks);

        if (!nearestEnemy) {
            // No enemy, just move forward
            input.w = true;
            return input;
        }

        // Navigate using shortest wrapped path angle
        const angleToEnemy = this.wrappedAngle(bot.x, bot.y, nearestEnemy.x, nearestEnemy.y);
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

        // Shoot only if enemy is reachable via direct path (bullets don't wrap)
        const directDist = this.directDist(bot.x, bot.y, nearestEnemy.x, nearestEnemy.y);
        if (Math.abs(angleDiff) < 30 && directDist < 900) {
            // Check if clear shot on direct path
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
     * Find nearest enemy tank (wrapping-aware distance)
     */
    findNearestEnemy(bot, allTanks) {
        let nearest = null;
        let minDist = Infinity;

        for (const tank of allTanks) {
            if (tank.id === bot.id || tank.team === bot.team || tank.respawning) {
                continue;
            }

            const dist = this.wrappedDist(bot.x, bot.y, tank.x, tank.y);
            if (dist < minDist) {
                minDist = dist;
                nearest = tank;
            }
        }

        return nearest;
    }

    /**
     * Check if bot has clear shot to target (direct path, no wrapping - bullets don't wrap)
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
