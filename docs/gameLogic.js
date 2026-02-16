// Shared game logic for both client and server
// Works in both Node.js and browser without eval

// Get CONFIG based on environment
let CONFIG;
if (typeof require !== 'undefined') {
    CONFIG = require('./constants.js').CONFIG;
} else if (typeof window !== 'undefined') {
    CONFIG = window.CONFIG;
}

/**
 * Seeded random number generator for consistent obstacle generation
 */
function seededRandom(seed) {
    let value = seed;
    return function() {
        value = (value * 9301 + 49297) % 233280;
        return value / 233280;
    };
}

/**
 * Generate obstacles using a seed for consistency
 */
function generateObstacles(seed = Math.random()) {
    const rng = seededRandom(seed);
    const obstacles = [];

    const margin = 250;
    const centerX = CONFIG.CANVAS_WIDTH / 2;
    const centerY = CONFIG.CANVAS_HEIGHT / 2;
    const centerRadius = 500;

    for (let i = 0; i < CONFIG.NUM_OBSTACLES; i++) {
        let attempts = 0;
        let validPosition = false;
        let x, y, width, height;

        while (!validPosition && attempts < 50) {
            const isWall = rng() < 0.8;

            if (isWall) {
                if (rng() < 0.5) {
                    width = 300 + rng() * 400;
                    height = 40 + rng() * 60;
                } else {
                    width = 40 + rng() * 60;
                    height = 300 + rng() * 400;
                }
            } else {
                const size = 150 + rng() * 200;
                width = size;
                height = size;
            }

            x = margin + rng() * (CONFIG.CANVAS_WIDTH - width - margin * 2);
            y = margin + rng() * (CONFIG.CANVAS_HEIGHT - height - margin * 2);

            const distToCenter = Math.hypot(x + width/2 - centerX, y + height/2 - centerY);
            if (distToCenter < centerRadius) {
                attempts++;
                continue;
            }

            validPosition = true;
            for (let obs of obstacles) {
                const padding = 150;
                const dx = (x + width/2) - (obs.x + obs.width/2);
                const dy = (y + height/2) - (obs.y + obs.height/2);
                const dist = Math.hypot(dx, dy);
                const minDist = Math.max(width, height, obs.width, obs.height) / 2 + padding;

                if (dist < minDist) {
                    validPosition = false;
                    break;
                }
            }

            attempts++;
        }

        if (validPosition) {
            obstacles.push({ x, y, width, height });
        }
    }

    return obstacles;
}

/**
 * Check if position collides with obstacles or tanks
 */
function checkCollision(x, y, size, obstacles, tanks, excludeTankId = null) {
    for (let obs of obstacles) {
        if (x + size > obs.x &&
            x < obs.x + obs.width &&
            y + size > obs.y &&
            y < obs.y + obs.height) {
            return true;
        }
    }

    for (let tank of tanks) {
        if (tank.id === excludeTankId) continue;

        const dist = Math.hypot(tank.x - x, tank.y - y);
        if (dist < size + CONFIG.TANK_SIZE / 2) {
            return true;
        }
    }

    return false;
}

/**
 * Wrap position around canvas edges
 */
function wrapPosition(pos, max) {
    if (pos < 0) return max + pos;
    if (pos > max) return pos - max;
    return pos;
}

/**
 * Normalize angle to 0-360 range
 */
function normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
}

/**
 * Calculate shortest angle difference (-180 to 180)
 */
function angleDifference(from, to) {
    let diff = to - from;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return diff;
}

// Export for Node.js or attach to window for browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        seededRandom,
        generateObstacles,
        checkCollision,
        wrapPosition,
        normalizeAngle,
        angleDifference
    };
} else if (typeof window !== 'undefined') {
    window.seededRandom = seededRandom;
    window.generateObstacles = generateObstacles;
    window.checkCollision = checkCollision;
    window.wrapPosition = wrapPosition;
    window.normalizeAngle = normalizeAngle;
    window.angleDifference = angleDifference;
}
