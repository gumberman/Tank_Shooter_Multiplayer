// Shared game logic for both client and server
// Dual export format: works in both Node.js and browser

(function(exports) {
    // Get CONFIG from the appropriate source
    const CONFIG = typeof require !== 'undefined'
        ? require('./constants.js').CONFIG
        : window.CONFIG;

    /**
     * Seeded random number generator for consistent obstacle generation
     * @param {number} seed - Seed value
     * @returns {function} Random number generator function
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
     * @param {number} seed - Seed for random generation
     * @returns {Array} Array of obstacle objects {x, y, width, height}
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
                        // Horizontal wall
                        width = 300 + rng() * 400;
                        height = 40 + rng() * 60;
                    } else {
                        // Vertical wall
                        width = 40 + rng() * 60;
                        height = 300 + rng() * 400;
                    }
                } else {
                    // Square obstacle
                    const size = 150 + rng() * 200;
                    width = size;
                    height = size;
                }

                x = margin + rng() * (CONFIG.CANVAS_WIDTH - width - margin * 2);
                y = margin + rng() * (CONFIG.CANVAS_HEIGHT - height - margin * 2);

                // Check if too close to center
                const distToCenter = Math.hypot(x + width/2 - centerX, y + height/2 - centerY);
                if (distToCenter < centerRadius) {
                    attempts++;
                    continue;
                }

                // Check if overlaps with existing obstacles
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
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} size - Object size
     * @param {Array} obstacles - Array of obstacles
     * @param {Array} tanks - Array of tanks
     * @param {string} excludeTankId - Tank ID to exclude from collision check
     * @returns {boolean} True if collision detected
     */
    function checkCollision(x, y, size, obstacles, tanks, excludeTankId = null) {
        // Check obstacle collision
        for (let obs of obstacles) {
            if (x + size > obs.x &&
                x < obs.x + obs.width &&
                y + size > obs.y &&
                y < obs.y + obs.height) {
                return true;
            }
        }

        // Check tank collision
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
     * @param {number} pos - Position value
     * @param {number} max - Maximum value (canvas dimension)
     * @returns {number} Wrapped position
     */
    function wrapPosition(pos, max) {
        if (pos < 0) return max + pos;
        if (pos > max) return pos - max;
        return pos;
    }

    /**
     * Normalize angle to 0-360 range
     * @param {number} angle - Angle in degrees
     * @returns {number} Normalized angle
     */
    function normalizeAngle(angle) {
        return ((angle % 360) + 360) % 360;
    }

    /**
     * Calculate shortest angle difference (-180 to 180)
     * @param {number} from - Start angle
     * @param {number} to - Target angle
     * @returns {number} Angle difference
     */
    function angleDifference(from, to) {
        let diff = to - from;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        return diff;
    }

    // Export all functions
    exports.seededRandom = seededRandom;
    exports.generateObstacles = generateObstacles;
    exports.checkCollision = checkCollision;
    exports.wrapPosition = wrapPosition;
    exports.normalizeAngle = normalizeAngle;
    exports.angleDifference = angleDifference;

})(typeof exports === 'undefined' ? this : exports);
