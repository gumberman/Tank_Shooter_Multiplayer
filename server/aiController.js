const { CONFIG } = require('../shared/constants');
const { angleDifference } = require('../shared/gameLogic');

/**
 * Simplified AI Controller for server-side bots
 * Relies on wall sliding to handle obstacles - always presses forward
 */
class AIController {
    constructor() {
        // No state tracking needed - wall sliding handles obstacles
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
     * Find nearest enemy tank
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
     * Get input for a bot
     */
    getInput(bot, allTanks, bullets, obstacles, powerups = []) {
        const input = { w: true, a: false, s: false, d: false, space: false };

        // Check if bot is currently wall sliding - commit to direction, don't turn
        const now = Date.now();
        const isSliding = bot.slidingUntil && now < bot.slidingUntil;

        const target = this.findNearestEnemy(bot, allTanks);
        if (!target) {
            // No enemy, just keep moving forward
            return input;
        }

        // Navigate toward target (but not while sliding)
        const angleToTarget = this.wrappedAngle(bot.x, bot.y, target.x, target.y);
        const angleDiff = angleDifference(bot.rotation, angleToTarget);

        // Only rotate if not sliding along a wall
        if (!isSliding && Math.abs(angleDiff) > 5) {
            if (angleDiff > 0) {
                input.d = true;
            } else {
                input.a = true;
            }
        }

        // Always move forward - wall sliding handles obstacles
        input.w = true;

        // Shooting - only at enemies within direct line of sight
        const directDist = this.directDist(bot.x, bot.y, target.x, target.y);
        if (Math.abs(angleDiff) < 25 && directDist < 900) {
            if (this.hasClearShot(bot, target, obstacles)) {
                input.space = true;
            }
        }

        // Dodge incoming bullets (override sliding behavior for survival)
        const threatBullet = this.findThreatBullet(bot, bullets);
        if (threatBullet) {
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
     * Clean up state for a bot (no-op now, but kept for interface compatibility)
     */
    removeBot(botId) {
        // No state to clean up
    }
}

module.exports = AIController;
