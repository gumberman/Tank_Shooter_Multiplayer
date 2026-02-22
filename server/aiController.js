const { CONFIG } = require('../shared/constants');
const { normalizeAngle, angleDifference } = require('../shared/gameLogic');

/**
 * Simplified AI Controller for server-side bots
 * Includes wall avoidance and stuck detection
 */
class AIController {
    constructor() {
        this.lastInputs = new Map(); // botId -> last input state
        this.positionHistory = new Map(); // botId -> [{x, y, time}]
        this.stuckState = new Map(); // botId -> {isStuck, escapeDir, escapeUntil}
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
     * Check if a point is inside an obstacle (with padding)
     */
    pointInObstacle(x, y, obstacles, padding = 0) {
        const halfTank = CONFIG.TANK_SIZE / 2 + padding;
        for (const obs of obstacles) {
            if (x + halfTank > obs.x &&
                x - halfTank < obs.x + obs.width &&
                y + halfTank > obs.y &&
                y - halfTank < obs.y + obs.height) {
                return obs;
            }
        }
        return null;
    }

    /**
     * Cast a ray from bot and check for obstacle collision
     * Returns distance to obstacle or Infinity if clear
     */
    raycastToObstacle(x, y, angle, maxDist, obstacles) {
        const rad = angle * Math.PI / 180;
        const stepSize = 20;
        const steps = Math.ceil(maxDist / stepSize);

        for (let i = 1; i <= steps; i++) {
            const dist = i * stepSize;
            const checkX = x + Math.cos(rad) * dist;
            const checkY = y + Math.sin(rad) * dist;

            if (this.pointInObstacle(checkX, checkY, obstacles)) {
                return dist;
            }
        }
        return Infinity;
    }

    /**
     * Check for walls using feelers (rays cast in multiple directions)
     * Returns steering suggestion: -1 (turn left), 0 (clear), 1 (turn right)
     */
    checkWallFeelers(bot, obstacles) {
        const feelerDist = 100; // How far ahead to look
        const feelerAngles = [-45, -20, 0, 20, 45]; // Angles relative to bot rotation

        let leftBlocked = 0;
        let rightBlocked = 0;
        let frontBlocked = false;

        for (const relAngle of feelerAngles) {
            const absAngle = bot.rotation + relAngle;
            const dist = this.raycastToObstacle(bot.x, bot.y, absAngle, feelerDist, obstacles);

            if (dist < feelerDist) {
                // Weight by how close the obstacle is
                const weight = 1 - (dist / feelerDist);

                if (relAngle < -10) {
                    leftBlocked += weight;
                } else if (relAngle > 10) {
                    rightBlocked += weight;
                } else {
                    frontBlocked = true;
                }
            }
        }

        // If front is blocked, suggest turning toward less blocked side
        if (frontBlocked || leftBlocked > 0.3 || rightBlocked > 0.3) {
            if (leftBlocked < rightBlocked) {
                return -1; // Turn left
            } else if (rightBlocked < leftBlocked) {
                return 1; // Turn right
            } else {
                // Both sides equally blocked, pick randomly but consistently
                return (bot.id.charCodeAt(0) % 2 === 0) ? -1 : 1;
            }
        }

        return 0; // Clear ahead
    }

    /**
     * Update position history and detect if bot is stuck
     */
    updateStuckDetection(bot) {
        const now = Date.now();
        const historyWindow = 1000; // Check movement over 1 second
        const stuckThreshold = 30; // Must move at least 30px in that time
        const escapeTime = 800; // How long to execute escape maneuver

        // Get or create position history
        let history = this.positionHistory.get(bot.id);
        if (!history) {
            history = [];
            this.positionHistory.set(bot.id, history);
        }

        // Add current position
        history.push({ x: bot.x, y: bot.y, time: now });

        // Remove old entries
        while (history.length > 0 && now - history[0].time > historyWindow) {
            history.shift();
        }

        // Check stuck state
        let stuckState = this.stuckState.get(bot.id);
        if (!stuckState) {
            stuckState = { isStuck: false, escapeDir: 1, escapeUntil: 0 };
            this.stuckState.set(bot.id, stuckState);
        }

        // If currently escaping, check if escape time is over
        if (stuckState.isStuck && now > stuckState.escapeUntil) {
            stuckState.isStuck = false;
        }

        // If not escaping, check if we're stuck
        if (!stuckState.isStuck && history.length >= 2) {
            const oldest = history[0];
            const totalMovement = this.directDist(oldest.x, oldest.y, bot.x, bot.y);

            if (totalMovement < stuckThreshold && now - oldest.time >= historyWindow * 0.8) {
                // We're stuck! Start escape maneuver
                stuckState.isStuck = true;
                stuckState.escapeDir = Math.random() > 0.5 ? 1 : -1;
                stuckState.escapeUntil = now + escapeTime;
                // Clear history so we don't immediately re-trigger
                history.length = 0;
            }
        }

        return stuckState;
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

        // Check if bot is stuck and needs escape maneuver
        const stuckState = this.updateStuckDetection(bot);
        if (stuckState.isStuck) {
            // Escape: reverse and turn
            input.s = true;
            if (stuckState.escapeDir > 0) {
                input.d = true;
            } else {
                input.a = true;
            }
            return input;
        }

        // Check wall feelers for obstacle avoidance
        const wallSteering = this.checkWallFeelers(bot, obstacles);

        // Find nearest enemy (wrapping-aware)
        const nearestEnemy = this.findNearestEnemy(bot, allTanks);

        if (!nearestEnemy) {
            // No enemy, move forward but avoid walls
            if (wallSteering !== 0) {
                if (wallSteering < 0) {
                    input.a = true;
                } else {
                    input.d = true;
                }
            }
            input.w = true;
            return input;
        }

        // Navigate using shortest wrapped path angle
        const angleToEnemy = this.wrappedAngle(bot.x, bot.y, nearestEnemy.x, nearestEnemy.y);
        const angleDiff = angleDifference(bot.rotation, angleToEnemy);

        // Wall avoidance takes priority over enemy pursuit
        if (wallSteering !== 0) {
            // Wall ahead - turn away from it
            if (wallSteering < 0) {
                input.a = true;
            } else {
                input.d = true;
            }
            // Still try to move, but slower (not full forward)
            input.w = true;
        } else {
            // No wall - normal enemy pursuit
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
        }

        // Shoot only if enemy is reachable via direct path (bullets don't wrap)
        const directDist = this.directDist(bot.x, bot.y, nearestEnemy.x, nearestEnemy.y);
        if (Math.abs(angleDiff) < 30 && directDist < 900) {
            // Check if clear shot on direct path
            if (this.hasClearShot(bot, nearestEnemy, obstacles)) {
                input.space = true;
            }
        }

        // Dodge incoming bullets (overrides other movement but not shooting)
        const threatBullet = this.findThreatBullet(bot, bullets);
        if (threatBullet) {
            // Try to move perpendicular to bullet direction
            input.w = false;
            input.s = true; // Back up from threat
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

    /**
     * Clean up state for a bot (call when bot is removed)
     */
    removeBot(botId) {
        this.lastInputs.delete(botId);
        this.positionHistory.delete(botId);
        this.stuckState.delete(botId);
    }
}

module.exports = AIController;
