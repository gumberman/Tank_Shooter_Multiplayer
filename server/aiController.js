const { CONFIG } = require('../shared/constants');
const { normalizeAngle, angleDifference } = require('../shared/gameLogic');

/**
 * Simplified AI Controller for server-side bots
 * Includes wall avoidance optimized for axis-aligned rectangular obstacles
 */
class AIController {
    constructor() {
        this.lastInputs = new Map(); // botId -> last input state
        this.positionHistory = new Map(); // botId -> [{x, y, time}]
        this.stuckState = new Map(); // botId -> {isStuck, escapeDir, escapeUntil}
        this.wallSlideState = new Map(); // botId -> {slideAngle, slideUntil}
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
     * Check if a point collides with an obstacle (with tank size padding)
     */
    pointHitsObstacle(x, y, obstacles) {
        const halfTank = CONFIG.TANK_SIZE / 2;
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
     * Find obstacle blocking the path ahead (checks along bot's forward direction)
     */
    findObstacleAhead(bot, obstacles, lookAhead = 80) {
        const rad = bot.rotation * Math.PI / 180;
        const checkX = bot.x + Math.cos(rad) * lookAhead;
        const checkY = bot.y + Math.sin(rad) * lookAhead;
        return this.pointHitsObstacle(checkX, checkY, obstacles);
    }

    /**
     * For axis-aligned obstacles: determine slide direction to go around
     * Returns an absolute angle to slide along the wall toward the target
     */
    getWallSlideAngle(bot, obstacle, targetX, targetY) {
        const halfTank = CONFIG.TANK_SIZE / 2;

        // Obstacle bounds with tank padding
        const obsLeft = obstacle.x - halfTank;
        const obsRight = obstacle.x + obstacle.width + halfTank;
        const obsTop = obstacle.y - halfTank;
        const obsBottom = obstacle.y + obstacle.height + halfTank;

        // Determine which face we're approaching based on bot position relative to obstacle center
        const obsCenterX = obstacle.x + obstacle.width / 2;
        const obsCenterY = obstacle.y + obstacle.height / 2;

        // Calculate overlap to determine primary blocking axis
        const overlapX = Math.min(bot.x, obsRight) - Math.max(bot.x, obsLeft);
        const overlapY = Math.min(bot.y, obsBottom) - Math.max(bot.y, obsTop);

        // Determine if we're hitting a vertical face (left/right) or horizontal face (top/bottom)
        const hittingVerticalFace = bot.x < obsLeft || bot.x > obsRight ||
            (overlapX < overlapY && (bot.x < obsCenterX || bot.x > obsCenterX));

        if (bot.x < obsCenterX && (hittingVerticalFace || overlapY > overlapX)) {
            // Approaching from left - slide up or down
            return targetY < bot.y ? -90 : 90; // -90 = up, 90 = down
        } else if (bot.x > obsCenterX && (hittingVerticalFace || overlapY > overlapX)) {
            // Approaching from right - slide up or down
            return targetY < bot.y ? -90 : 90;
        } else if (bot.y < obsCenterY) {
            // Approaching from top - slide left or right
            return targetX < bot.x ? 180 : 0; // 180 = left, 0 = right
        } else {
            // Approaching from bottom - slide left or right
            return targetX < bot.x ? 180 : 0;
        }
    }

    /**
     * Update wall slide state - commits to a slide direction briefly to avoid jitter
     */
    updateWallSlide(bot, obstacle, targetX, targetY) {
        const now = Date.now();
        let slideState = this.wallSlideState.get(bot.id);

        if (!slideState) {
            slideState = { slideAngle: null, slideUntil: 0 };
            this.wallSlideState.set(bot.id, slideState);
        }

        // If currently sliding and time hasn't expired, continue
        if (slideState.slideAngle !== null && now < slideState.slideUntil) {
            return slideState.slideAngle;
        }

        // If obstacle detected, start or refresh slide
        if (obstacle) {
            const slideAngle = this.getWallSlideAngle(bot, obstacle, targetX, targetY);
            slideState.slideAngle = slideAngle;
            slideState.slideUntil = now + 300; // Commit to direction for 300ms
            return slideAngle;
        }

        // No obstacle, clear slide state
        slideState.slideAngle = null;
        return null;
    }

    /**
     * Update position history and detect if bot is stuck
     */
    updateStuckDetection(bot) {
        const now = Date.now();
        const historyWindow = 1500;
        const stuckThreshold = 15;
        const escapeTime = 500;

        let history = this.positionHistory.get(bot.id);
        if (!history) {
            history = [];
            this.positionHistory.set(bot.id, history);
        }

        history.push({ x: bot.x, y: bot.y, time: now });

        while (history.length > 0 && now - history[0].time > historyWindow) {
            history.shift();
        }

        let stuckState = this.stuckState.get(bot.id);
        if (!stuckState) {
            stuckState = { isStuck: false, escapeDir: 1, escapeUntil: 0 };
            this.stuckState.set(bot.id, stuckState);
        }

        if (stuckState.isStuck && now > stuckState.escapeUntil) {
            stuckState.isStuck = false;
        }

        if (!stuckState.isStuck && history.length >= 2) {
            const oldest = history[0];
            const totalMovement = this.directDist(oldest.x, oldest.y, bot.x, bot.y);

            if (totalMovement < stuckThreshold && now - oldest.time >= historyWindow * 0.8) {
                stuckState.isStuck = true;
                stuckState.escapeDir = Math.random() > 0.5 ? 1 : -1;
                stuckState.escapeUntil = now + escapeTime;
                history.length = 0;
            }
        }

        return stuckState;
    }

    /**
     * Get input for a bot
     */
    getInput(bot, allTanks, bullets, obstacles) {
        const input = { w: false, a: false, s: false, d: false, space: false };

        // Check if bot is stuck
        const stuckState = this.updateStuckDetection(bot);
        if (stuckState.isStuck) {
            if (stuckState.escapeDir > 0) {
                input.d = true;
            } else {
                input.a = true;
            }
            return input;
        }

        // Find nearest enemy
        const nearestEnemy = this.findNearestEnemy(bot, allTanks);
        const targetX = nearestEnemy ? nearestEnemy.x : bot.x + Math.cos(bot.rotation * Math.PI / 180) * 100;
        const targetY = nearestEnemy ? nearestEnemy.y : bot.y + Math.sin(bot.rotation * Math.PI / 180) * 100;

        // Check for obstacle ahead
        const obstacleAhead = this.findObstacleAhead(bot, obstacles);
        const slideAngle = this.updateWallSlide(bot, obstacleAhead, targetX, targetY);

        if (slideAngle !== null) {
            // Wall sliding: turn toward slide angle and move forward
            const angleDiff = angleDifference(bot.rotation, slideAngle);

            if (Math.abs(angleDiff) > 10) {
                if (angleDiff > 0) {
                    input.d = true;
                } else {
                    input.a = true;
                }
            }
            input.w = true;
        } else if (nearestEnemy) {
            // Normal enemy pursuit
            const angleToEnemy = this.wrappedAngle(bot.x, bot.y, nearestEnemy.x, nearestEnemy.y);
            const angleDiff = angleDifference(bot.rotation, angleToEnemy);

            if (Math.abs(angleDiff) > 5) {
                if (angleDiff > 0) {
                    input.d = true;
                } else {
                    input.a = true;
                }
            }

            if (Math.abs(angleDiff) < 45) {
                input.w = true;
            }

            // Shooting
            const directDist = this.directDist(bot.x, bot.y, nearestEnemy.x, nearestEnemy.y);
            if (Math.abs(angleDiff) < 30 && directDist < 900) {
                if (this.hasClearShot(bot, nearestEnemy, obstacles)) {
                    input.space = true;
                }
            }
        } else {
            // No enemy, just move forward
            input.w = true;
        }

        // Dodge incoming bullets
        const threatBullet = this.findThreatBullet(bot, bullets);
        if (threatBullet) {
            input.w = false;
            // Consistent dodge direction based on bullet position
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
            if (dist < 200) {
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
     * Clean up state for a bot
     */
    removeBot(botId) {
        this.lastInputs.delete(botId);
        this.positionHistory.delete(botId);
        this.stuckState.delete(botId);
        this.wallSlideState.delete(botId);
    }
}

module.exports = AIController;
