// Game Configuration
const CONFIG = {
    CANVAS_WIDTH: 2400,
    CANVAS_HEIGHT: 2400,
    TANK_SIZE: 120, // Much larger for visibility
    TANK_SPEED: 5,
    BULLET_SPEED: 17, // 40% faster than original 12
    BULLET_RADIUS: 12,
    SHOOT_COOLDOWN: 1000, // 1 second
    MAX_HEALTH: 3,
    WIN_SCORE: 24, // First team to 24 kills
    ROTATION_SPEED: 2,
    NUM_OBSTACLES: Math.floor(Math.random() * 6) + 3, // Random 3-8 obstacles
    TICK_RATE: 16,
    MAX_TEAM_SIZE: 3, // For testing
    BASE_RESPAWN_TIME: 1000, // 1 second base
    RESPAWN_INCREMENT: 2000, // +2 seconds per death
    MAX_RESPAWN_TIME: 20000 // 20 seconds max
};

// Team colors - one solid color per team
const TEAM_COLORS = {
    1: '#00ff00', // Green team
    2: '#ff0000'  // Red team
};

// ============================================
// CLASSES
// ============================================

class Tank {
    constructor(x, y, color, id, isPlayer = false, team = 1, number = 1) {
        this.x = x;
        this.y = y;
        this.rotation = Math.random() * 360; // random initial direction
        this.color = color;
        this.id = id;
        this.team = team;
        this.number = number; // 2-digit number (01-99)
        this.health = CONFIG.MAX_HEALTH;
        this.score = 0;
        this.deaths = 0;
        this.lastShot = 0;
        this.isPlayer = isPlayer;
        this.name = isPlayer ? 'You' : `Tank ${id}`;
        this.respawning = false;
        this.respawnTimer = 0;

        // AI state - Enhanced
        this.lastX = x;
        this.lastY = y;
        this.stuckCounter = 0;
        this.aiTurnDirection = Math.random() > 0.5 ? 1 : -1;
        this.aiState = 'explore'; // explore, stuck, combat, hunt, flee, cover, flank

        // AI personality (affects decision making)
        this.aiPersonality = this.isPlayer ? null : this.generatePersonality();

        // Advanced AI tracking
        this.targetEnemy = null;
        this.lastSeenEnemyPos = null;
        this.coverPosition = null;
        this.flankPosition = null;
        this.lastDamageTime = 0;
        this.consecutiveHits = 0;
        this.shotsFired = 0;
        this.shotsHit = 0;
        this.dodgeDirection = 0;
        this.dodgeTimer = 0;
        this.repositionTimer = 0;
        this.aggressionLevel = 0.5; // 0 = defensive, 1 = aggressive

        // AI state management
        this.stateLockTimer = 0;
        this.currentWaypoint = null;
        this.patrolSector = null;
    }

    turnLeft() {
        this.rotation = (this.rotation - CONFIG.ROTATION_SPEED + 360) % 360;
    }

    turnRight() {
        this.rotation = (this.rotation + CONFIG.ROTATION_SPEED) % 360;
    }

    moveForward(obstacles, tanks) {
        const rad = this.rotation * Math.PI / 180;
        let newX = this.x + Math.cos(rad) * CONFIG.TANK_SPEED;
        let newY = this.y + Math.sin(rad) * CONFIG.TANK_SPEED;

        // Wraparound at edges
        newX = this.wrapPosition(newX, CONFIG.CANVAS_WIDTH);
        newY = this.wrapPosition(newY, CONFIG.CANVAS_HEIGHT);

        if (this.canMoveTo(newX, newY, obstacles, tanks)) {
            this.x = newX;
            this.y = newY;
        }
    }

    moveBackward(obstacles, tanks) {
        const rad = this.rotation * Math.PI / 180;
        let newX = this.x - Math.cos(rad) * CONFIG.TANK_SPEED;
        let newY = this.y - Math.sin(rad) * CONFIG.TANK_SPEED;

        // Wraparound at edges
        newX = this.wrapPosition(newX, CONFIG.CANVAS_WIDTH);
        newY = this.wrapPosition(newY, CONFIG.CANVAS_HEIGHT);

        if (this.canMoveTo(newX, newY, obstacles, tanks)) {
            this.x = newX;
            this.y = newY;
        }
    }

    wrapPosition(pos, max) {
        if (pos < 0) return pos + max;
        if (pos > max) return pos - max;
        return pos;
    }

    canMoveTo(newX, newY, obstacles, tanks) {
        // Check obstacle collision using circle-based detection
        if (this.checkObstacleCollision(obstacles, newX, newY)) {
            return false;
        }

        // Check tank collision
        for (let tank of tanks) {
            if (tank.id !== this.id && tank.health > 0) {
                const dist = Math.hypot(newX - tank.x, newY - tank.y);
                if (dist < CONFIG.TANK_SIZE) {
                    return false;
                }
            }
        }

        return true;
    }

    rectCollision(x1, y1, w1, h1, x2, y2, w2, h2) {
        return x1 < x2 + w2 &&
               x1 + w1 > x2 &&
               y1 < y2 + h2 &&
               y1 + h1 > y2;
    }

    canShoot() {
        return Date.now() - this.lastShot >= CONFIG.SHOOT_COOLDOWN;
    }

    shoot() {
        if (this.canShoot()) {
            this.lastShot = Date.now();
            const rad = this.rotation * Math.PI / 180;
            const bulletX = this.x + Math.cos(rad) * (CONFIG.TANK_SIZE / 2 + 10);
            const bulletY = this.y + Math.sin(rad) * (CONFIG.TANK_SIZE / 2 + 10);

            // Apply recoil - push tank backwards
            const recoilDistance = 15;
            this.x -= Math.cos(rad) * recoilDistance;
            this.y -= Math.sin(rad) * recoilDistance;

            return new Bullet(bulletX, bulletY, this.rotation, this.id, this.team);
        }
        return null;
    }

    takeDamage() {
        this.health--;
        this.lastDamageTime = Date.now();
        this.consecutiveHits++;

        // Adjust aggression based on getting hit
        if (!this.isPlayer) {
            this.aggressionLevel = Math.max(0.2, this.aggressionLevel - 0.1);
        }

        return this.health <= 0;
    }

    generatePersonality() {
        const types = ['aggressive', 'tactical', 'defensive', 'sniper', 'brawler'];
        const type = types[Math.floor(Math.random() * types.length)];

        const personalities = {
            aggressive: {
                type: 'aggressive',
                engageRange: 800,
                fleeHealthThreshold: 0,
                coverSeekingProbability: 0.2,
                aggressionBase: 0.9,
                accuracyModifier: 0.8,
                speedModifier: 1.2
            },
            tactical: {
                type: 'tactical',
                engageRange: 600,
                fleeHealthThreshold: 1,
                coverSeekingProbability: 0.6,
                aggressionBase: 0.6,
                accuracyModifier: 1.0,
                speedModifier: 1.0
            },
            defensive: {
                type: 'defensive',
                engageRange: 500,
                fleeHealthThreshold: 2,
                coverSeekingProbability: 0.8,
                aggressionBase: 0.3,
                accuracyModifier: 1.1,
                speedModifier: 0.9
            },
            sniper: {
                type: 'sniper',
                engageRange: 700,
                fleeHealthThreshold: 2,
                coverSeekingProbability: 0.7,
                aggressionBase: 0.4,
                accuracyModifier: 1.3,
                speedModifier: 0.8
            },
            brawler: {
                type: 'brawler',
                engageRange: 400,
                fleeHealthThreshold: 0,
                coverSeekingProbability: 0.1,
                aggressionBase: 1.0,
                accuracyModifier: 0.9,
                speedModifier: 1.1
            }
        };

        return personalities[type];
    }

    generatePersonalityByRole(role) {
        const personalities = {
            aggressive: {
                type: 'aggressive',
                engageRange: 800,
                fleeHealthThreshold: 0,
                coverSeekingProbability: 0.2,
                aggressionBase: 0.9,
                accuracyModifier: 0.8,
                speedModifier: 1.2
            },
            tactical: {
                type: 'tactical',
                engageRange: 600,
                fleeHealthThreshold: 1,
                coverSeekingProbability: 0.6,
                aggressionBase: 0.6,
                accuracyModifier: 1.0,
                speedModifier: 1.0
            },
            defensive: {
                type: 'defensive',
                engageRange: 500,
                fleeHealthThreshold: 2,
                coverSeekingProbability: 0.8,
                aggressionBase: 0.3,
                accuracyModifier: 1.1,
                speedModifier: 0.9
            },
            sniper: {
                type: 'sniper',
                engageRange: 700,
                fleeHealthThreshold: 2,
                coverSeekingProbability: 0.7,
                aggressionBase: 0.4,
                accuracyModifier: 1.3,
                speedModifier: 0.8
            },
            brawler: {
                type: 'brawler',
                engageRange: 400,
                fleeHealthThreshold: 0,
                coverSeekingProbability: 0.1,
                aggressionBase: 1.0,
                accuracyModifier: 0.9,
                speedModifier: 1.1
            }
        };

        return personalities[role] || personalities['tactical'];
    }

    respawn(game) {
        this.health = CONFIG.MAX_HEALTH;
        // Find random safe position
        const safePos = game.findSafeSpawn({
            x: Math.random() * (CONFIG.CANVAS_WIDTH - 100) + 50,
            y: Math.random() * (CONFIG.CANVAS_HEIGHT - 100) + 50
        });
        this.x = safePos.x;
        this.y = safePos.y;
        // Set safe rotation to avoid respawning facing obstacles
        this.rotation = game.findSafeRotation(safePos.x, safePos.y);
    }

    // AI helper methods
    checkObstacleCollision(obstacles, x, y) {
        const halfSize = CONFIG.TANK_SIZE / 2;

        for (let obs of obstacles) {
            // Precise AABB (Axis-Aligned Bounding Box) collision detection
            if (x + halfSize > obs.x &&
                x - halfSize < obs.x + obs.width &&
                y + halfSize > obs.y &&
                y - halfSize < obs.y + obs.height) {
                return true;
            }
        }
        return false;
    }

    checkObstacleAhead(obstacles, distance = 60) {
        const rad = this.rotation * Math.PI / 180;
        const checkX = this.x + Math.cos(rad) * distance;
        const checkY = this.y + Math.sin(rad) * distance;

        return this.checkObstacleCollision(obstacles, checkX, checkY);
    }

    checkObstacleAtAngle(obstacles, angleOffset, distance = 50) {
        const rad = (this.rotation + angleOffset) * Math.PI / 180;
        const checkX = this.x + Math.cos(rad) * distance;
        const checkY = this.y + Math.sin(rad) * distance;

        return this.checkObstacleCollision(obstacles, checkX, checkY);
    }

    isStuck() {
        const moved = Math.hypot(this.x - this.lastX, this.y - this.lastY);
        return moved < 1; // Barely moved
    }

    updateLastPosition() {
        this.lastX = this.x;
        this.lastY = this.y;
    }

    findNearestEnemy(tanks) {
        let nearest = null;
        let minDist = Infinity;

        for (let tank of tanks) {
            if (tank.id !== this.id && tank.team !== this.team && tank.health > 0) {
                const dist = Math.hypot(tank.x - this.x, tank.y - this.y);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = tank;
                }
            }
        }

        return { tank: nearest, distance: minDist };
    }

    getAngleTo(x, y) {
        const dx = x - this.x;
        const dy = y - this.y;
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        if (angle < 0) angle += 360;
        return angle;
    }

    getAngleDifference(targetAngle) {
        let diff = targetAngle - this.rotation;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        return diff;
    }

    rotateToward(targetAngle) {
        const diff = this.getAngleDifference(targetAngle);

        if (Math.abs(diff) < CONFIG.ROTATION_SPEED) {
            this.rotation = targetAngle;
            return true; // Facing target
        } else if (diff > 0) {
            this.turnRight();
        } else {
            this.turnLeft();
        }
        return false; // Still rotating
    }

    hasLineOfSight(target, obstacles) {
        // Simple raycast to check if path to target is clear
        const steps = 20;
        const dx = (target.x - this.x) / steps;
        const dy = (target.y - this.y) / steps;

        for (let i = 1; i < steps; i++) {
            const checkX = this.x + dx * i;
            const checkY = this.y + dy * i;

            for (let obs of obstacles) {
                if (checkX > obs.x && checkX < obs.x + obs.width &&
                    checkY > obs.y && checkY < obs.y + obs.height) {
                    return false;
                }
            }
        }
        return true;
    }

    // Advanced AI Helper Methods
    predictTargetPosition(target, leadTime = 0.5) {
        // Predict where target will be based on their velocity
        if (!target.lastX || !target.lastY) return { x: target.x, y: target.y };

        const vx = target.x - target.lastX;
        const vy = target.y - target.lastY;

        return {
            x: target.x + vx * leadTime * 60, // Assuming 60fps
            y: target.y + vy * leadTime * 60
        };
    }

    evaluateThreat(enemy, obstacles) {
        if (!enemy || enemy.health <= 0) return 0;

        const distance = Math.hypot(enemy.x - this.x, enemy.y - this.y);
        const hasLOS = this.hasLineOfSight(enemy, obstacles);

        let threat = 0;

        // Close enemies are more threatening
        threat += Math.max(0, 1000 - distance) / 10;

        // Enemies with LOS are more threatening
        if (hasLOS) threat += 50;

        // Low health enemies are less threatening
        threat -= (CONFIG.MAX_HEALTH - enemy.health) * 15;

        // Enemies facing us are more threatening
        const angleTo = this.getAngleTo(enemy.x, enemy.y);
        const enemyAngleTo = enemy.getAngleTo(this.x, this.y);
        const enemyFacing = Math.abs(enemy.getAngleDifference(enemyAngleTo)) < 30;
        if (enemyFacing) threat += 30;

        return Math.max(0, threat);
    }

    findBestTarget(tanks, obstacles) {
        let bestTarget = null;
        let bestScore = -Infinity;

        for (let tank of tanks) {
            if (tank.id === this.id || tank.team === this.team || tank.health <= 0 || tank.respawning) continue;

            const distance = Math.hypot(tank.x - this.x, tank.y - this.y);
            const hasLOS = this.hasLineOfSight(tank, obstacles);

            let score = 0;

            // Prefer closer enemies
            score += 1000 - distance;

            // Prefer low-health enemies (finish them)
            score += (CONFIG.MAX_HEALTH - tank.health) * 200;

            // Prefer enemies with LOS
            if (hasLOS) score += 300;

            // Prefer enemies targeting us
            if (tank.targetEnemy === this) score += 250;

            // Prefer player (make AI care about player)
            if (tank.isPlayer) score += 200;

            // Team coordination - focus fire
            const teammatesTargeting = tanks.filter(t =>
                t.team === this.team &&
                t.id !== this.id &&
                t.targetEnemy === tank
            ).length;
            score += teammatesTargeting * 150;

            if (score > bestScore) {
                bestScore = score;
                bestTarget = tank;
            }
        }

        return bestTarget;
    }

    findCover(obstacles, enemyPos) {
        let bestCover = null;
        let bestScore = -1;

        for (let obs of obstacles) {
            // Check corners and sides of obstacles
            const positions = [
                { x: obs.x - 100, y: obs.y + obs.height / 2 }, // Left side
                { x: obs.x + obs.width + 100, y: obs.y + obs.height / 2 }, // Right side
                { x: obs.x + obs.width / 2, y: obs.y - 100 }, // Top side
                { x: obs.x + obs.width / 2, y: obs.y + obs.height + 100 }, // Bottom side
            ];

            for (let pos of positions) {
                // Check if position is valid
                if (pos.x < 0 || pos.x > CONFIG.CANVAS_WIDTH || pos.y < 0 || pos.y > CONFIG.CANVAS_HEIGHT) continue;

                // Check if obstacle blocks line to enemy
                const midX = (pos.x + enemyPos.x) / 2;
                const midY = (pos.y + enemyPos.y) / 2;

                let blocked = false;
                for (let checkObs of obstacles) {
                    if (checkObs === obs &&
                        midX > checkObs.x && midX < checkObs.x + checkObs.width &&
                        midY > checkObs.y && midY < checkObs.y + checkObs.height) {
                        blocked = true;
                        break;
                    }
                }

                if (blocked) {
                    const distToCover = Math.hypot(pos.x - this.x, pos.y - this.y);
                    const distToEnemy = Math.hypot(pos.x - enemyPos.x, pos.y - enemyPos.y);

                    // Prefer closer cover that's not too close to enemy
                    const score = (1000 - distToCover) + (distToEnemy > 300 ? 100 : -100);

                    if (score > bestScore) {
                        bestScore = score;
                        bestCover = pos;
                    }
                }
            }
        }

        return bestCover;
    }

    findFlankPosition(target, obstacles) {
        // Try to find a position to the side of the target
        const distToTarget = Math.hypot(target.x - this.x, target.y - this.y);
        const angleToTarget = this.getAngleTo(target.x, target.y);

        // Try flanking from left or right
        const flankAngle = this.aiTurnDirection > 0 ? angleToTarget + 90 : angleToTarget - 90;
        const flankDist = Math.min(400, distToTarget * 0.8);

        const rad = flankAngle * Math.PI / 180;
        const flankX = target.x + Math.cos(rad) * flankDist;
        const flankY = target.y + Math.sin(rad) * flankDist;

        // Wrap around
        const wrappedX = ((flankX % CONFIG.CANVAS_WIDTH) + CONFIG.CANVAS_WIDTH) % CONFIG.CANVAS_WIDTH;
        const wrappedY = ((flankY % CONFIG.CANVAS_HEIGHT) + CONFIG.CANVAS_HEIGHT) % CONFIG.CANVAS_HEIGHT;

        return { x: wrappedX, y: wrappedY };
    }

    shouldDodge(bullets) {
        // Check if any bullets are coming close
        for (let bullet of bullets) {
            if (bullet.ownerTeam === this.team) continue;

            const distToBullet = Math.hypot(bullet.x - this.x, bullet.y - this.y);
            if (distToBullet < 200) {
                // Check if bullet is heading towards us
                const bulletFutureX = bullet.x + bullet.vx * 20;
                const bulletFutureY = bullet.y + bullet.vy * 20;
                const futureDist = Math.hypot(bulletFutureX - this.x, bulletFutureY - this.y);

                if (futureDist < distToBullet) {
                    // Bullet is getting closer
                    return true;
                }
            }
        }
        return false;
    }

    getVelocity() {
        return {
            vx: this.x - this.lastX,
            vy: this.y - this.lastY
        };
    }

    // Adaptive learning - adjust based on performance
    updateLearning() {
        if (this.shotsFired > 10) {
            const accuracy = this.shotsHit / this.shotsFired;

            if (accuracy < 0.2) {
                // Poor accuracy - become more careful
                this.aiPersonality.accuracyModifier = Math.min(1.5, this.aiPersonality.accuracyModifier + 0.05);
                this.aggressionLevel = Math.max(0.2, this.aggressionLevel - 0.05);
            } else if (accuracy > 0.5) {
                // Good accuracy - become more aggressive
                this.aiPersonality.accuracyModifier = Math.max(0.8, this.aiPersonality.accuracyModifier - 0.02);
                this.aggressionLevel = Math.min(1.0, this.aggressionLevel + 0.05);
            }
        }
    }

    // Calculate precise bullet travel time and lead target
    calculateInterceptShot(target) {
        if (!target) return null;

        // Get target velocity
        const targetVx = target.x - (target.lastX || target.x);
        const targetVy = target.y - (target.lastY || target.y);

        // Calculate intercept point using projectile motion prediction
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distance = Math.hypot(dx, dy);

        // Bullet travel time
        const bulletTravelTime = distance / CONFIG.BULLET_SPEED;

        // Predict target position
        const predictedX = target.x + targetVx * bulletTravelTime;
        const predictedY = target.y + targetVy * bulletTravelTime;

        // Calculate angle to predicted position
        const interceptAngle = this.getAngleTo(predictedX, predictedY);

        // Check if we can shoot (cooldown ready)
        const canShootNow = this.canShoot();
        const timeUntilCanShoot = canShootNow ? 0 : (CONFIG.SHOOT_COOLDOWN - (Date.now() - this.lastShot));

        return {
            angle: interceptAngle,
            distance: distance,
            travelTime: bulletTravelTime,
            canShootNow: canShootNow,
            timeUntilCanShoot: timeUntilCanShoot,
            predictedX: predictedX,
            predictedY: predictedY
        };
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation * Math.PI / 180);

        // Draw player indicator (glowing ring)
        if (this.isPlayer) {
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 6;
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#ffff00';
            ctx.beginPath();
            ctx.arc(0, 0, CONFIG.TANK_SIZE / 2 + 15, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Draw tank body
        ctx.fillStyle = this.color;
        ctx.fillRect(-CONFIG.TANK_SIZE / 2, -CONFIG.TANK_SIZE / 2, CONFIG.TANK_SIZE, CONFIG.TANK_SIZE);

        // Draw tank outline (thin yellow for player only)
        if (this.isPlayer) {
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 3;
            ctx.strokeRect(-CONFIG.TANK_SIZE / 2, -CONFIG.TANK_SIZE / 2, CONFIG.TANK_SIZE, CONFIG.TANK_SIZE);
        }

        // Draw barrel (much bigger and longer) - BEFORE counter-rotation
        ctx.fillStyle = '#333';
        const barrelWidth = 24; // Much thicker
        const barrelLength = CONFIG.TANK_SIZE * 0.9; // Much longer
        ctx.fillRect(0, -barrelWidth / 2, barrelLength, barrelWidth);

        // Draw health indicator
        if (this.health < CONFIG.MAX_HEALTH) {
            const barWidth = CONFIG.TANK_SIZE;
            const barHeight = 8;
            const healthPercent = this.health / CONFIG.MAX_HEALTH;

            // Draw background (dark)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(-barWidth / 2, -CONFIG.TANK_SIZE / 2 - 20, barWidth, barHeight);

            // Draw health (red)
            ctx.fillStyle = 'red';
            ctx.fillRect(-barWidth / 2, -CONFIG.TANK_SIZE / 2 - 20, barWidth * healthPercent, barHeight);
        }

        ctx.restore();

        // Draw name tag (50% bigger)
        ctx.fillStyle = this.isPlayer ? '#ffff00' : '#fff';
        ctx.font = this.isPlayer ? 'bold 72px Arial' : 'bold 54px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Stroke for readability
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 3;

        if (this.isPlayer) {
            ctx.strokeText('YOU', this.x, this.y - CONFIG.TANK_SIZE - 30);
            ctx.fillText('YOU', this.x, this.y - CONFIG.TANK_SIZE - 30);
        } else {
            ctx.strokeText(this.name, this.x, this.y - CONFIG.TANK_SIZE - 25);
            ctx.fillText(this.name, this.x, this.y - CONFIG.TANK_SIZE - 25);
        }
    }
}

class Bullet {
    constructor(x, y, angle, ownerId, ownerTeam) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.ownerId = ownerId;
        this.ownerTeam = ownerTeam;
        this.active = true;

        const rad = angle * Math.PI / 180;
        this.vx = Math.cos(rad) * CONFIG.BULLET_SPEED;
        this.vy = Math.sin(rad) * CONFIG.BULLET_SPEED;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        // Bullets don't wrap - they disappear at edges
        if (this.x < 0 || this.x > CONFIG.CANVAS_WIDTH ||
            this.y < 0 || this.y > CONFIG.CANVAS_HEIGHT) {
            this.active = false;
        }
    }

    checkCollision(obstacles, tanks, shooterTeam) {
        // Check obstacle collision using precise point-in-rectangle detection
        for (let obs of obstacles) {
            if (this.x > obs.x && this.x < obs.x + obs.width &&
                this.y > obs.y && this.y < obs.y + obs.height) {
                this.active = false;
                return null;
            }
        }

        // Check tank collision - bullets stop on ANY tank (friendly or enemy)
        for (let tank of tanks) {
            if (tank.id !== this.ownerId && tank.health > 0 && !tank.respawning) {
                const dist = Math.hypot(this.x - tank.x, this.y - tank.y);
                if (dist < CONFIG.TANK_SIZE / 2 + CONFIG.BULLET_RADIUS) {
                    this.active = false;
                    // Only return tank if it's an enemy (for damage), otherwise return null
                    return tank.team !== shooterTeam ? tank : null;
                }
            }
        }

        return null;
    }

    draw(ctx) {
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(this.x, this.y, CONFIG.BULLET_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Particle {
    constructor(x, y, color, velocityX, velocityY) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = velocityX;
        this.vy = velocityY;
        this.size = 3 + Math.random() * 5;
        this.life = 1.0; // 0 to 1
        this.decay = 0.015 + Math.random() * 0.02;
        this.gravity = 0.1;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.life -= this.decay;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    isDead() {
        return this.life <= 0;
    }
}

// ============================================
// GAME STATE
// ============================================

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.tanks = [];
        this.bullets = [];
        this.particles = [];
        this.obstacles = [];
        this.playerTank = null;
        this.gameMode = null; // 'practice', 'multiplayer'
        this.gameRunning = false;
        this.keys = {};
        this.lastUpdate = Date.now();
        this.teamScores = { 1: 0, 2: 0 };
        this.usedNumbers = new Set(); // Track used tank numbers

        // Multiplayer properties
        this.networkManager = null;
        this.playerId = null;
        this.roomCode = null;
        this.obstacleSeed = null;
        this.serverTanks = new Map(); // Server authoritative tank states
        this.interpolationBuffers = new Map(); // For smooth remote player rendering
        this.lastServerUpdate = 0;
        this.isHost = false;

        this.setupEventListeners();
    }

    getUniqueTankNumber() {
        let number;
        do {
            number = Math.floor(Math.random() * 99) + 1; // 1-99
        } while (this.usedNumbers.has(number));
        this.usedNumbers.add(number);
        return number;
    }

    assignPatrolSector(tank, index) {
        // Divide map into 4 quadrants
        const sectors = [
            { x: CONFIG.CANVAS_WIDTH * 0.25, y: CONFIG.CANVAS_HEIGHT * 0.25 }, // Top-left
            { x: CONFIG.CANVAS_WIDTH * 0.75, y: CONFIG.CANVAS_HEIGHT * 0.25 }, // Top-right
            { x: CONFIG.CANVAS_WIDTH * 0.25, y: CONFIG.CANVAS_HEIGHT * 0.75 }, // Bottom-left
            { x: CONFIG.CANVAS_WIDTH * 0.75, y: CONFIG.CANVAS_HEIGHT * 0.75 }  // Bottom-right
        ];
        tank.patrolSector = sectors[index % sectors.length];
    }

    setupEventListeners() {
        // Keyboard input
        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = true;
            this.keys[e.key] = true; // Also store original case

            // Prevent space from scrolling
            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
            }
        });

        document.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = false;
            this.keys[e.key] = false;
        });

        // Menu buttons
        document.getElementById('practice-btn').addEventListener('click', () => this.startPractice());
        document.getElementById('create-game-btn').addEventListener('click', () => this.createMultiplayerGame());
        document.getElementById('join-game-btn').addEventListener('click', () => this.showJoinMenu());
        document.getElementById('back-btn').addEventListener('click', () => this.showMainMenu());
        document.getElementById('join-room-btn').addEventListener('click', () => this.joinRoom());
        document.getElementById('start-game-btn').addEventListener('click', () => this.startMultiplayerGame());
        document.getElementById('leave-btn').addEventListener('click', () => this.leaveRoom());
        document.getElementById('join-green-btn').addEventListener('click', () => this.switchTeam(1));
        document.getElementById('join-red-btn').addEventListener('click', () => this.switchTeam(2));
        document.getElementById('play-again-btn').addEventListener('click', () => this.playAgain());
    }

    generateObstacles(seed = Math.random()) {
        // Use shared code for consistent obstacle generation
        this.obstacles = generateObstacles(seed);
    }

    startPractice() {
        this.gameMode = 'practice';
        this.initGame();
        this.hideMenu();
        this.startGameLoop();
    }

    async createMultiplayerGame() {
        const playerName = prompt('Enter your name:');
        if (!playerName) return;

        try {
            // Initialize network manager
            this.networkManager = new NetworkManager();

            // Connect to server
            await this.networkManager.connect();

            // Set up event handlers
            this.setupNetworkHandlers();

            // Create room
            this.networkManager.createRoom(playerName);
        } catch (error) {
            console.error('Failed to create game:', error);
            alert('Failed to connect to server. Please try again.');
        }
    }

    async joinRoom() {
        const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
        if (!roomCode || roomCode.length !== 6) {
            alert('Please enter a valid 6-character room code');
            return;
        }

        const playerName = prompt('Enter your name:');
        if (!playerName) return;

        try {
            // Initialize network manager
            this.networkManager = new NetworkManager();

            // Connect to server
            await this.networkManager.connect();

            // Set up event handlers
            this.setupNetworkHandlers();

            // Join room
            this.networkManager.joinRoom(roomCode, playerName);
        } catch (error) {
            console.error('Failed to join room:', error);
            alert('Failed to connect to server. Please try again.');
        }
    }

    setupNetworkHandlers() {
        // Room created
        this.networkManager.on('roomCreated', (data) => {
            console.log('Room created:', data);
            this.playerId = data.playerId;
            this.roomCode = data.roomCode;
            this.obstacleSeed = data.seed;
            this.isHost = true;
            this.showLobby(data.roomCode, data.players);
        });

        // Room joined
        this.networkManager.on('roomJoined', (data) => {
            console.log('Room joined:', data);
            this.playerId = this.networkManager.getPlayerId();
            this.roomCode = data.roomCode;
            this.obstacleSeed = data.seed;
            this.isHost = false;
            this.showLobby(data.roomCode, data.players);
        });

        // Player joined
        this.networkManager.on('playerJoined', (data) => {
            console.log('Player joined:', data);
            this.updateLobbyPlayers();
        });

        // Player left
        this.networkManager.on('playerLeft', (data) => {
            console.log('Player left:', data);
            this.updateLobbyPlayers();
        });

        // Team changed
        this.networkManager.on('teamChanged', (data) => {
            console.log('Team changed:', data);
            this.updateLobbyPlayers(data.players);
        });

        // Game start
        this.networkManager.on('gameStart', (data) => {
            console.log('Game starting:', data);
            this.startMultiplayerGameClient(data);
        });

        // Game state updates
        this.networkManager.on('gameState', (data) => {
            this.handleGameState(data);
        });

        // Game over
        this.networkManager.on('gameOver', (data) => {
            this.handleGameOver(data);
        });

        // Error
        this.networkManager.on('error', (data) => {
            console.error('Server error:', data);
            alert(data.message);
        });
    }

    showLobby(roomCode, players) {
        // Hide main menu, show lobby
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('join-menu').style.display = 'none';
        document.getElementById('lobby').style.display = 'block';

        // Set room code
        document.getElementById('room-code').textContent = roomCode;

        // Show/hide start button based on host status
        const startBtn = document.getElementById('start-game-btn');
        startBtn.style.display = this.isHost ? 'block' : 'none';

        // Update player list
        this.updateLobbyPlayers(players);
    }

    updateLobbyPlayers(players) {
        // If players not provided, keep existing display
        if (!players) return;

        const lobbyPlayers = document.getElementById('lobby-players');
        lobbyPlayers.innerHTML = '<h3>Players:</h3>';

        const team1 = players.filter(p => p.team === 1);
        const team2 = players.filter(p => p.team === 2);

        lobbyPlayers.innerHTML += '<div style="color: #00ff00;"><strong>Green Team:</strong></div>';
        team1.forEach(p => {
            const marker = p.id === this.playerId ? ' (You)' : '';
            lobbyPlayers.innerHTML += `<div>• ${p.name}${marker}</div>`;
        });

        lobbyPlayers.innerHTML += '<div style="color: #ff0000; margin-top: 10px;"><strong>Red Team:</strong></div>';
        team2.forEach(p => {
            const marker = p.id === this.playerId ? ' (You)' : '';
            lobbyPlayers.innerHTML += `<div>• ${p.name}${marker}</div>`;
        });
    }

    startMultiplayerGame() {
        if (this.isHost) {
            this.networkManager.startGame();
        }
    }

    leaveRoom() {
        if (this.networkManager) {
            this.networkManager.leaveRoom();
            this.networkManager.disconnect();
            this.networkManager = null;
        }
        this.showMainMenu();
    }

    switchTeam(team) {
        if (this.networkManager && this.networkManager.isConnected()) {
            this.networkManager.switchTeam(team);
        }
    }

    startMultiplayerGameClient(data) {
        this.gameMode = 'multiplayer';
        this.obstacleSeed = data.seed;

        // Initialize game with multiplayer mode
        this.initMultiplayerGame(data.players);

        this.hideMenu();
        this.startGameLoop();
    }

    initMultiplayerGame(players) {
        this.tanks = [];
        this.bullets = [];
        this.particles = [];
        this.teamScores = { 1: 0, 2: 0 };
        this.usedNumbers.clear();

        // Generate obstacles using server seed
        this.generateObstacles(this.obstacleSeed);

        // Create only the human player's tank initially
        // Server will send authoritative state for all tanks
        const playerInfo = players.find(p => p.id === this.playerId);
        if (playerInfo) {
            const playerSpawnPos = this.findSafeSpawn({ x: CONFIG.CANVAS_WIDTH / 2, y: CONFIG.CANVAS_HEIGHT / 2 });
            this.playerTank = new Tank(
                playerSpawnPos.x,
                playerSpawnPos.y,
                TEAM_COLORS[playerInfo.team],
                this.playerId,
                true,
                playerInfo.team,
                1
            );
            this.playerTank.name = playerInfo.name;
            this.tanks.push(this.playerTank);
        }

        this.gameRunning = true;
        this.updateUI();
    }

    handleGameState(state) {
        this.lastServerUpdate = state.timestamp;
        this.teamScores = state.teamScores;

        // Update server tank states
        for (const serverTank of state.tanks) {
            this.serverTanks.set(serverTank.id, serverTank);

            // Update interpolation buffer for remote players
            if (serverTank.id !== this.playerId) {
                if (!this.interpolationBuffers.has(serverTank.id)) {
                    this.interpolationBuffers.set(serverTank.id, []);
                }
                const buffer = this.interpolationBuffers.get(serverTank.id);
                buffer.push({
                    ...serverTank,
                    timestamp: state.timestamp
                });

                // Keep only last 3 snapshots
                if (buffer.length > 3) {
                    buffer.shift();
                }
            }
        }

        // Reconcile player tank with server
        if (this.playerTank) {
            this.reconcilePlayerTank();
        }

        // Update bullets (server authoritative)
        this.bullets = state.bullets.map(b => ({
            x: b.x,
            y: b.y,
            id: b.id,
            team: b.team,
            radius: CONFIG.BULLET_RADIUS
        }));

        // Update obstacles if full snapshot
        if (state.fullSnapshot && state.obstacles) {
            this.obstacles = state.obstacles;
        }

        // Update UI
        this.updateScoreboard();
    }

    reconcilePlayerTank() {
        const serverTank = this.serverTanks.get(this.playerId);
        if (!serverTank || !this.playerTank) return;

        // Calculate position difference
        const dx = serverTank.x - this.playerTank.x;
        const dy = serverTank.y - this.playerTank.y;
        const dist = Math.hypot(dx, dy);

        // Snap if large difference (> 50px)
        if (dist > CONFIG.NETWORK.POSITION_CORRECTION_THRESHOLD) {
            this.playerTank.x = serverTank.x;
            this.playerTank.y = serverTank.y;
        }
        // Smooth correction for medium differences (10-50px)
        else if (dist > CONFIG.NETWORK.POSITION_LERP_THRESHOLD) {
            this.playerTank.x += dx * 0.2;
            this.playerTank.y += dy * 0.2;
        }

        // Always trust server for these properties
        this.playerTank.health = serverTank.health;
        this.playerTank.score = serverTank.score;
        this.playerTank.deaths = serverTank.deaths;
        this.playerTank.respawning = serverTank.respawning;
        this.playerTank.respawnTimer = serverTank.respawnTimer;

        // Handle respawn
        if (serverTank.respawning && !this.playerTank.respawning) {
            this.playerTank.x = serverTank.x;
            this.playerTank.y = serverTank.y;
        }
    }

    interpolateRemotePlayers() {
        const now = Date.now();
        const renderTime = now - CONFIG.INTERPOLATION_DELAY;

        // Update/create tanks for all remote players
        for (const [tankId, buffer] of this.interpolationBuffers.entries()) {
            if (buffer.length < 2) continue;

            // Find two snapshots to interpolate between
            let older = null;
            let newer = null;

            for (let i = 0; i < buffer.length - 1; i++) {
                if (buffer[i].timestamp <= renderTime && buffer[i + 1].timestamp >= renderTime) {
                    older = buffer[i];
                    newer = buffer[i + 1];
                    break;
                }
            }

            if (!older || !newer) {
                // Use latest if no interpolation range found
                older = buffer[buffer.length - 2];
                newer = buffer[buffer.length - 1];
            }

            // Calculate interpolation factor
            const timeDiff = newer.timestamp - older.timestamp;
            const t = timeDiff > 0 ? (renderTime - older.timestamp) / timeDiff : 1;
            const clampedT = Math.max(0, Math.min(1, t));

            // Find or create tank
            let tank = this.tanks.find(t => t.id === tankId);
            if (!tank) {
                tank = new Tank(
                    older.x,
                    older.y,
                    TEAM_COLORS[older.team],
                    tankId,
                    false,
                    older.team,
                    older.number || 1
                );
                tank.name = older.name;
                tank.isBot = older.isBot;
                this.tanks.push(tank);
            }

            // Interpolate position
            tank.x = older.x + (newer.x - older.x) * clampedT;
            tank.y = older.y + (newer.y - older.y) * clampedT;

            // Interpolate rotation (handle wraparound)
            let rotDiff = newer.rotation - older.rotation;
            if (rotDiff > 180) rotDiff -= 360;
            if (rotDiff < -180) rotDiff += 360;
            tank.rotation = (older.rotation + rotDiff * clampedT + 360) % 360;

            // Update other properties (no interpolation needed)
            tank.health = newer.health;
            tank.score = newer.score;
            tank.deaths = newer.deaths;
            tank.respawning = newer.respawning;
            tank.respawnTimer = newer.respawnTimer;
        }

        // Remove tanks that are no longer in server state
        const serverTankIds = new Set(this.serverTanks.keys());
        this.tanks = this.tanks.filter(tank => {
            if (tank.id === this.playerId) return true;
            return serverTankIds.has(tank.id);
        });
    }

    handleGameOver(data) {
        this.gameRunning = false;
        const winningTeamName = data.winningTeam === 1 ? 'Green' : 'Red';
        this.showGameOver(winningTeamName, data.stats);
    }

    showJoinMenu() {
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('join-menu').style.display = 'block';
    }

    showMainMenu() {
        document.getElementById('main-menu').style.display = 'block';
        document.getElementById('join-menu').style.display = 'none';
        document.getElementById('lobby').style.display = 'none';
    }

    hideMenu() {
        document.getElementById('menu-overlay').classList.remove('active');
    }

    showMenu() {
        document.getElementById('menu-overlay').classList.add('active');
    }

    spawnParticles(x, y, color, count = 15) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 6;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed - 2; // Slight upward bias
            this.particles.push(new Particle(x, y, color, vx, vy));
        }
    }

    initGame() {
        this.tanks = [];
        this.bullets = [];
        this.particles = [];
        this.teamScores = { 1: 0, 2: 0 };
        this.usedNumbers.clear(); // Reset used numbers
        this.generateObstacles(Math.random());

        // Create player tank on Team 1
        const playerSpawnPos = this.findSafeSpawn({ x: CONFIG.CANVAS_WIDTH / 4, y: CONFIG.CANVAS_HEIGHT / 2 });
        this.playerTank = new Tank(
            playerSpawnPos.x,
            playerSpawnPos.y,
            TEAM_COLORS[1],
            'player',
            true,
            1,
            this.getUniqueTankNumber()
        );
        // Set safe rotation for player
        this.playerTank.rotation = this.findSafeRotation(playerSpawnPos.x, playerSpawnPos.y);
        this.tanks.push(this.playerTank);

        // Create teams
        if (this.gameMode === 'practice') {
            // Team 1 spawn positions (left side)
            const team1Spawns = [
                { x: CONFIG.CANVAS_WIDTH / 4, y: 300 },
                { x: CONFIG.CANVAS_WIDTH / 4, y: CONFIG.CANVAS_HEIGHT - 300 },
                { x: 300, y: CONFIG.CANVAS_HEIGHT / 2 },
                { x: CONFIG.CANVAS_WIDTH / 4, y: CONFIG.CANVAS_HEIGHT / 4 },
                { x: CONFIG.CANVAS_WIDTH / 4, y: (CONFIG.CANVAS_HEIGHT * 3) / 4 }
            ];

            // Team 2 spawn positions (right side)
            const team2Spawns = [
                { x: (CONFIG.CANVAS_WIDTH * 3) / 4, y: CONFIG.CANVAS_HEIGHT / 2 },
                { x: (CONFIG.CANVAS_WIDTH * 3) / 4, y: 300 },
                { x: (CONFIG.CANVAS_WIDTH * 3) / 4, y: CONFIG.CANVAS_HEIGHT - 300 },
                { x: CONFIG.CANVAS_WIDTH - 300, y: CONFIG.CANVAS_HEIGHT / 2 },
                { x: (CONFIG.CANVAS_WIDTH * 3) / 4, y: CONFIG.CANVAS_HEIGHT / 4 },
                { x: (CONFIG.CANVAS_WIDTH * 3) / 4, y: (CONFIG.CANVAS_HEIGHT * 3) / 4 }
            ];

            // Fill Team 1 with bots (player is already on Team 1)
            // Assign roles: first = aggressive, second = tactical
            const team1Roles = ['aggressive', 'tactical'];
            for (let i = 1; i < CONFIG.MAX_TEAM_SIZE; i++) {
                const spawnPos = this.findSafeSpawn(team1Spawns[i - 1]);
                const tankNumber = this.getUniqueTankNumber();
                const tank = new Tank(
                    spawnPos.x,
                    spawnPos.y,
                    TEAM_COLORS[1],
                    `team1_bot${i}`,
                    false,
                    1,
                    tankNumber
                );
                // Assign specific role instead of random
                const role = team1Roles[i - 1];
                tank.aiPersonality = tank.generatePersonalityByRole(role);

                // Assign patrol sector
                this.assignPatrolSector(tank, i - 1);

                // Show personality type in name
                const personalityIcon = {
                    'aggressive': '⚔️',
                    'tactical': '🎯',
                    'defensive': '🛡️',
                    'sniper': '🎪',
                    'brawler': '💪'
                };
                const icon = personalityIcon[tank.aiPersonality.type] || '';
                tank.name = `G${tankNumber} ${icon}`;
                // Set safe rotation to avoid spawning facing obstacles
                tank.rotation = this.findSafeRotation(spawnPos.x, spawnPos.y);
                this.tanks.push(tank);
            }

            // Fill Team 2 with bots
            // Assign roles: aggressive, tactical, defensive/sniper
            const team2Roles = ['aggressive', 'tactical', 'sniper'];
            for (let i = 0; i < CONFIG.MAX_TEAM_SIZE; i++) {
                const spawnPos = this.findSafeSpawn(team2Spawns[i]);
                const tankNumber = this.getUniqueTankNumber();
                const tank = new Tank(
                    spawnPos.x,
                    spawnPos.y,
                    TEAM_COLORS[2],
                    `team2_bot${i}`,
                    false,
                    2,
                    tankNumber
                );
                // Assign specific role instead of random
                const role = team2Roles[i];
                tank.aiPersonality = tank.generatePersonalityByRole(role);

                // Assign patrol sector
                this.assignPatrolSector(tank, i);

                // Show personality type in name
                const personalityIcon = {
                    'aggressive': '⚔️',
                    'tactical': '🎯',
                    'defensive': '🛡️',
                    'sniper': '🎪',
                    'brawler': '💪'
                };
                const icon = personalityIcon[tank.aiPersonality.type] || '';
                tank.name = `R${tankNumber} ${icon}`;
                // Set safe rotation to avoid spawning facing obstacles
                tank.rotation = this.findSafeRotation(spawnPos.x, spawnPos.y);
                this.tanks.push(tank);
            }
        }

        this.gameRunning = true;
        this.updateUI();
    }

    findSafeSpawn(preferredPos) {
        // Try preferred position first
        if (this.isPositionSafe(preferredPos.x, preferredPos.y)) {
            return preferredPos;
        }

        // Otherwise find a random safe position
        for (let attempt = 0; attempt < 100; attempt++) {
            const x = 150 + Math.random() * (CONFIG.CANVAS_WIDTH - 300);
            const y = 150 + Math.random() * (CONFIG.CANVAS_HEIGHT - 300);

            if (this.isPositionSafe(x, y)) {
                return { x, y };
            }
        }

        // Fallback to center if all else fails
        return { x: CONFIG.CANVAS_WIDTH / 2, y: CONFIG.CANVAS_HEIGHT / 2 };
    }

    findSafeRotation(x, y) {
        // Try to find a rotation that doesn't face an obstacle
        const testAngles = [0, 45, 90, 135, 180, 225, 270, 315];

        for (let angle of testAngles) {
            if (this.isPositionSafe(x, y, true, angle)) {
                return angle;
            }
        }

        // If no safe angle found, return a random one
        // (this shouldn't happen with the increased padding)
        return Math.random() * 360;
    }

    isPositionSafe(x, y, checkRotation = false, rotation = 0) {
        const halfSize = CONFIG.TANK_SIZE / 2;
        const padding = 200; // Safety margin to prevent spawning near obstacles

        // Check obstacles using precise AABB collision
        for (let obs of this.obstacles) {
            if (x + halfSize + padding > obs.x &&
                x - halfSize - padding < obs.x + obs.width &&
                y + halfSize + padding > obs.y &&
                y - halfSize - padding < obs.y + obs.height) {
                return false;
            }
        }

        // Check other tanks
        for (let tank of this.tanks) {
            const dist = Math.hypot(x - tank.x, y - tank.y);
            if (dist < CONFIG.TANK_SIZE * 3) {
                return false;
            }
        }

        // If checking rotation, ensure tank isn't facing directly into an obstacle
        if (checkRotation) {
            const rad = rotation * Math.PI / 180;
            const checkDistance = 200;
            const checkX = x + Math.cos(rad) * checkDistance;
            const checkY = y + Math.sin(rad) * checkDistance;

            for (let obs of this.obstacles) {
                if (checkX + halfSize > obs.x &&
                    checkX - halfSize < obs.x + obs.width &&
                    checkY + halfSize > obs.y &&
                    checkY - halfSize < obs.y + obs.height) {
                    return false;
                }
            }
        }

        return true;
    }

    handleInput() {
        if (!this.playerTank || this.playerTank.health <= 0 || this.playerTank.respawning) return;

        // Collect input state
        const input = {
            w: this.keys['w'] || this.keys['W'] || false,
            a: this.keys['a'] || this.keys['A'] || false,
            s: this.keys['s'] || this.keys['S'] || false,
            d: this.keys['d'] || this.keys['D'] || false,
            space: this.keys[' '] || this.keys['Space'] || false
        };

        // In multiplayer mode, send input to server and apply locally (client prediction)
        if (this.gameMode === 'multiplayer' && this.networkManager) {
            this.networkManager.sendInput(input);
            // Still apply input locally for responsive controls
            this.applyInput(input);
        }
        // In practice mode, apply input directly
        else if (this.gameMode === 'practice') {
            this.applyInput(input);
        }
    }

    applyInput(input) {
        if (!this.playerTank) return;

        const movingBackward = input.s;

        // Movement
        if (input.w) {
            this.playerTank.moveForward(this.obstacles, this.tanks);
        }
        if (input.s) {
            this.playerTank.moveBackward(this.obstacles, this.tanks);
        }

        // Turning - reverse controls when moving backward (like a car)
        if (input.a) {
            if (movingBackward) {
                this.playerTank.turnRight(); // Reversed when backing up
            } else {
                this.playerTank.turnLeft();
            }
        }
        if (input.d) {
            if (movingBackward) {
                this.playerTank.turnLeft(); // Reversed when backing up
            } else {
                this.playerTank.turnRight();
            }
        }

        // Shooting (only in practice mode - server handles in multiplayer)
        if (input.space && this.gameMode === 'practice') {
            const bullet = this.playerTank.shoot();
            if (bullet) {
                this.bullets.push(bullet);
                // Muzzle flash particles
                this.spawnParticles(bullet.x, bullet.y, '#ffff00', 8);
            }
        }
    }

    updateAI() {
        // Sophisticated AI system with multiple strategies
        for (let tank of this.tanks) {
            if (tank.isPlayer || tank.health <= 0) continue;

            const personality = tank.aiPersonality;
            if (!personality) continue; // Safety check

            // Update timers
            if (tank.dodgeTimer > 0) tank.dodgeTimer--;
            if (tank.repositionTimer > 0) tank.repositionTimer--;
            if (tank.stateLockTimer > 0) tank.stateLockTimer--;

            // Adaptive learning
            tank.updateLearning();

            // === PERCEPTION PHASE ===
            // Find best target based on threat assessment
            const target = tank.findBestTarget(this.tanks, this.obstacles);
            const distance = target ? Math.hypot(target.x - tank.x, target.y - tank.y) : Infinity;
            const hasLineOfSight = target ? tank.hasLineOfSight(target, this.obstacles) : false;

            // Update target tracking
            if (target) {
                tank.targetEnemy = target;
                tank.lastSeenEnemyPos = { x: target.x, y: target.y };
            }

            // Check for incoming bullets and need to dodge
            const shouldDodge = tank.shouldDodge(this.bullets);
            if (shouldDodge && tank.dodgeTimer === 0) {
                tank.dodgeDirection = Math.random() > 0.5 ? 1 : -1;
                tank.dodgeTimer = 30; // Dodge for 30 frames
            }

            // Check if stuck
            if (tank.isStuck()) {
                tank.stuckCounter++;
                if (tank.stuckCounter > 15) {
                    tank.aiState = 'stuck';
                }
            } else {
                tank.stuckCounter = 0;
                if (tank.aiState === 'stuck') {
                    tank.aiState = 'explore';
                }
            }

            // === DECISION PHASE ===
            // Decide AI state based on personality and situation
            if (tank.aiState !== 'stuck' && tank.stateLockTimer === 0) {
                // Update aggression based on recent damage
                if (Date.now() - tank.lastDamageTime < 3000) {
                    tank.aggressionLevel = Math.max(0.1, personality.aggressionBase - 0.3);
                } else {
                    tank.aggressionLevel = personality.aggressionBase;
                }

                // Adjust aggression based on team score
                const enemyTeam = tank.team === 1 ? 2 : 1;
                if (this.teamScores[tank.team] > this.teamScores[enemyTeam]) {
                    tank.aggressionLevel = Math.min(1.0, tank.aggressionLevel + 0.1);
                } else if (this.teamScores[tank.team] < this.teamScores[enemyTeam]) {
                    tank.aggressionLevel = Math.max(0.2, tank.aggressionLevel - 0.05);
                }

                // Decide state
                if (!target) {
                    tank.aiState = 'explore';
                } else {
                    // Health-based decisions
                    if (tank.health <= personality.fleeHealthThreshold && distance < 400) {
                        if (tank.aiState !== 'flee') {
                            tank.aiState = 'flee';
                            tank.stateLockTimer = 60; // Commit to fleeing for 1 second
                        }
                    }
                    // Cover seeking
                    else if (tank.health <= 2 && Math.random() < personality.coverSeekingProbability) {
                        if (!tank.coverPosition || tank.repositionTimer === 0) {
                            tank.coverPosition = tank.findCover(this.obstacles, target);
                            tank.repositionTimer = 180; // Reposition every 3 seconds
                        }
                        if (tank.coverPosition && tank.aiState !== 'cover') {
                            tank.aiState = 'cover';
                            tank.stateLockTimer = 60; // Commit to cover for 1 second
                        }
                    }
                    // Flanking maneuver (tactical personality prefers this)
                    else if (personality.type === 'tactical' && distance > 300 && distance < 600 && Math.random() < 0.3) {
                        if (!tank.flankPosition || tank.repositionTimer === 0) {
                            tank.flankPosition = tank.findFlankPosition(target, this.obstacles);
                            tank.repositionTimer = 120;
                        }
                        if (tank.aiState !== 'flank') {
                            tank.aiState = 'flank';
                            tank.stateLockTimer = 90; // Commit to flanking for 1.5 seconds
                        }
                    }
                    // Combat state
                    else if (distance < personality.engageRange && hasLineOfSight) {
                        tank.aiState = 'combat';
                    }
                    // Hunt state
                    else if (distance < personality.engageRange * 1.5) {
                        tank.aiState = 'hunt';
                    }
                    // Explore
                    else {
                        tank.aiState = 'explore';
                    }
                }
            }

            // === EXECUTION PHASE ===
            const obstacleAhead = tank.checkObstacleAhead(this.obstacles, 80);
            const obstacleLeft = tank.checkObstacleAtAngle(this.obstacles, -45, 60);
            const obstacleRight = tank.checkObstacleAtAngle(this.obstacles, 45, 60);

            // Execute behavior based on state
            if (tank.aiState === 'stuck') {
                // Advanced unstuck behavior - prioritize turning over backing up
                if (tank.stuckCounter % 2 === 0) {
                    // Rapid turning
                    for (let i = 0; i < 4; i++) {
                        if (tank.aiTurnDirection > 0) tank.turnRight();
                        else tank.turnLeft();
                    }
                }

                // Only back up briefly if absolutely necessary
                if (tank.stuckCounter < 10) {
                    tank.moveBackward(this.obstacles, this.tanks);
                } else {
                    // After initial backup, just turn rapidly
                    tank.turnRight();
                    tank.turnRight();
                    // Try moving forward after turning
                    if (!tank.checkObstacleAhead(this.obstacles, 60)) {
                        tank.moveForward(this.obstacles, this.tanks);
                    }
                }

                if (tank.stuckCounter > 30) {
                    tank.stuckCounter = 0;
                    tank.aiState = 'explore';
                    tank.aiTurnDirection *= -1; // Switch turn preference
                }

            } else if (tank.aiState === 'combat' && target) {
                // Calculate precise intercept shot
                const interceptData = tank.calculateInterceptShot(target);
                const targetAngle = interceptData.angle;
                const angleDiff = Math.abs(tank.getAngleDifference(targetAngle));

                // Aim at intercept position
                tank.rotateToward(targetAngle);

                // Movement logic with tracking
                if (tank.dodgeTimer > 0) {
                    // Perpendicular dodge movement (always forward)
                    const dodgeAngle = (targetAngle + (tank.dodgeDirection * 90)) % 360;
                    tank.rotateToward(dodgeAngle);
                    if (angleDiff < 90 && !obstacleAhead) {
                        tank.moveForward(this.obstacles, this.tanks);
                        }
                } else {
                    // Tactical positioning based on personality
                    if (personality.type === 'aggressive' || personality.type === 'brawler') {
                        // Aggressive: move forward aggressively
                        if (!obstacleAhead && distance > 100) {
                            tank.moveForward(this.obstacles, this.tanks);
                                } else if (obstacleAhead) {
                            // Turn instead of backing up
                            if (!obstacleLeft) tank.turnLeft();
                            else if (!obstacleRight) tank.turnRight();
                        }
                    } else if (personality.type === 'defensive' || personality.type === 'sniper') {
                        // Defensive: maintain optimal distance
                        if (distance < 250) {
                            // Too close, back up to maintain range
                            tank.moveBackward(this.obstacles, this.tanks);
                        } else if (distance > 400 && !obstacleAhead) {
                            // Too far, move closer
                            tank.moveForward(this.obstacles, this.tanks);
                        } else if (!obstacleAhead) {
                            // Good range, strafe to dodge
                            if (Math.random() < 0.3) {
                                const strafeDir = Math.random() > 0.5 ? 1 : -1;
                                if (strafeDir > 0) tank.turnRight();
                                else tank.turnLeft();
                            }
                            tank.moveForward(this.obstacles, this.tanks);
                        } else {
                            // Obstacle ahead, turn
                            if (!obstacleLeft) tank.turnLeft();
                            else if (!obstacleRight) tank.turnRight();
                        }
                    } else {
                        // Tactical: circle strafe and maintain engagement
                        if (distance > 200 && !obstacleAhead) {
                            tank.moveForward(this.obstacles, this.tanks);
                                } else if (!obstacleAhead) {
                            tank.moveForward(this.obstacles, this.tanks);
                                }
                        if (Math.random() < 0.4) {
                            if (tank.aiTurnDirection > 0) tank.turnRight();
                            else tank.turnLeft();
                        }
                    }
                }

                // Confidence-based shooting
                const shotQuality = Math.max(0, 1 - (angleDiff / 30));
                const confidence = shotQuality * personality.accuracyModifier;

                if (confidence > 0.6 && interceptData.canShootNow) {
                    const bullet = tank.shoot();
                    if (bullet) {
                        tank.shotsFired++;
                        this.bullets.push(bullet);
                        // Muzzle flash particles
                        this.spawnParticles(bullet.x, bullet.y, '#ffff00', 8);
                    }
                }

            } else if (tank.aiState === 'hunt' && target) {
                // Intelligent pathfinding toward target
                let targetPos = tank.lastSeenEnemyPos || target;
                const targetAngle = tank.getAngleTo(targetPos.x, targetPos.y);

                if (obstacleAhead) {
                    // Smart obstacle navigation - turn and keep moving forward
                    if (!obstacleLeft && obstacleRight) {
                        tank.turnLeft();
                        tank.moveForward(this.obstacles, this.tanks);
                        } else if (!obstacleRight && obstacleLeft) {
                        tank.turnRight();
                        tank.moveForward(this.obstacles, this.tanks);
                        } else if (!obstacleLeft && !obstacleRight) {
                        // Both sides clear, choose best angle
                        const angleDiff = tank.getAngleDifference(targetAngle);
                        if (angleDiff > 0) tank.turnRight();
                        else tank.turnLeft();
                        tank.moveForward(this.obstacles, this.tanks);
                        } else {
                        // Both sides blocked, turn around quickly
                        tank.turnRight();
                        tank.turnRight();
                    }
                } else {
                    // Rotate toward target and move
                    tank.rotateToward(targetAngle);
                    tank.moveForward(this.obstacles, this.tanks);
                }

                // Opportunistic shooting with confidence check
                const interceptData = tank.calculateInterceptShot(target);
                const shootAngle = interceptData.angle;
                const shootAngleDiff = Math.abs(tank.getAngleDifference(shootAngle));
                const shotQuality = Math.max(0, 1 - (shootAngleDiff / 30));
                const confidence = shotQuality * personality.accuracyModifier;

                if (confidence > 0.5 && interceptData.canShootNow && hasLineOfSight && Math.random() < 0.5) {
                    const bullet = tank.shoot();
                    if (bullet) {
                        tank.shotsFired++;
                        this.bullets.push(bullet);
                        // Muzzle flash particles
                        this.spawnParticles(bullet.x, bullet.y, '#ffff00', 8);
                    }
                }

            } else if (tank.aiState === 'flee' && target) {
                // Intelligent flee behavior - find cover while fleeing
                const fleeTarget = tank.coverPosition || {
                    x: tank.x + (tank.x - target.x),
                    y: tank.y + (tank.y - target.y)
                };

                const fleeAngle = tank.getAngleTo(fleeTarget.x, fleeTarget.y);

                if (obstacleAhead) {
                    // Turn away from obstacle and keep fleeing
                    if (!obstacleLeft) {
                        tank.turnLeft();
                        tank.turnLeft();
                    } else if (!obstacleRight) {
                        tank.turnRight();
                        tank.turnRight();
                    } else {
                        // Completely blocked, turn around
                        tank.turnRight();
                        tank.turnRight();
                    }
                }
                // Always try to flee forward
                tank.rotateToward(fleeAngle);
                tank.moveForward(this.obstacles, this.tanks);

                // Defensive shooting while fleeing with confidence check
                if (hasLineOfSight && Math.random() < 0.3 && tank.canShoot()) {
                    const interceptData = tank.calculateInterceptShot(target);
                    const fleeAngleDiff = Math.abs(tank.getAngleDifference(interceptData.angle));
                    const shotQuality = Math.max(0, 1 - (fleeAngleDiff / 30));
                    const confidence = shotQuality * personality.accuracyModifier;

                    if (confidence > 0.4) { // Lower threshold when fleeing
                        const bullet = tank.shoot();
                        if (bullet) {
                            tank.shotsFired++;
                            this.bullets.push(bullet);
                            // Muzzle flash particles
                            this.spawnParticles(bullet.x, bullet.y, '#ffff00', 8);
                        }
                    }
                }

            } else if (tank.aiState === 'cover' && tank.coverPosition) {
                // Move to cover position
                const distToCover = Math.hypot(tank.coverPosition.x - tank.x, tank.coverPosition.y - tank.y);
                const coverAngle = tank.getAngleTo(tank.coverPosition.x, tank.coverPosition.y);

                if (distToCover < 100) {
                    // Reached cover, switch to combat
                    tank.aiState = 'combat';
                    tank.coverPosition = null;
                } else {
                    // Move to cover
                    if (obstacleAhead) {
                        if (!obstacleLeft) tank.turnLeft();
                        else if (!obstacleRight) tank.turnRight();
                    } else {
                        tank.rotateToward(coverAngle);
                        tank.moveForward(this.obstacles, this.tanks);
                        }
                }

                // Shoot from cover with high confidence
                if (target && hasLineOfSight && tank.canShoot()) {
                    const interceptData = tank.calculateInterceptShot(target);
                    const coverAngleDiff = Math.abs(tank.getAngleDifference(interceptData.angle));
                    const shotQuality = Math.max(0, 1 - (coverAngleDiff / 30));
                    const confidence = shotQuality * personality.accuracyModifier;

                    if (confidence > 0.7) { // Higher threshold from cover (patient shots)
                        const bullet = tank.shoot();
                        if (bullet) {
                            tank.shotsFired++;
                            this.bullets.push(bullet);
                            // Muzzle flash particles
                            this.spawnParticles(bullet.x, bullet.y, '#ffff00', 8);
                        }
                    }
                }

            } else if (tank.aiState === 'flank' && tank.flankPosition) {
                // Execute flanking maneuver
                const distToFlank = Math.hypot(tank.flankPosition.x - tank.x, tank.flankPosition.y - tank.y);
                const flankAngle = tank.getAngleTo(tank.flankPosition.x, tank.flankPosition.y);

                if (distToFlank < 150) {
                    // Reached flank position, engage
                    tank.aiState = 'combat';
                    tank.flankPosition = null;
                } else {
                    // Move to flank position (always forward)
                    if (obstacleAhead) {
                        if (!obstacleLeft) tank.turnLeft();
                        else if (!obstacleRight) tank.turnRight();
                    } else {
                        tank.rotateToward(flankAngle);
                        tank.moveForward(this.obstacles, this.tanks);
                        }
                }

            } else {
                // Sector-based patrol exploration
                if (tank.patrolSector) {
                    const distToSector = Math.hypot(tank.patrolSector.x - tank.x, tank.patrolSector.y - tank.y);

                    // If far from patrol sector, return to it
                    if (distToSector > 600) {
                        const sectorAngle = tank.getAngleTo(tank.patrolSector.x, tank.patrolSector.y);

                        if (obstacleAhead) {
                            // Navigate around obstacles
                            if (!obstacleLeft) tank.turnLeft();
                            else if (!obstacleRight) tank.turnRight();
                        } else {
                            tank.rotateToward(sectorAngle);
                            tank.moveForward(this.obstacles, this.tanks);
                        }
                    } else {
                        // Patrol within sector
                        if (obstacleAhead) {
                            if (!obstacleLeft && obstacleRight) {
                                tank.turnLeft();
                            } else if (!obstacleRight && obstacleLeft) {
                                tank.turnRight();
                            } else if (!obstacleLeft && !obstacleRight) {
                                if (tank.aiTurnDirection > 0) tank.turnRight();
                                else tank.turnLeft();
                            } else {
                                tank.turnRight();
                                tank.turnRight();
                            }
                        }

                        if (!obstacleAhead) {
                            if (Math.random() < 0.02) {
                                tank.aiTurnDirection *= -1;
                            }
                            if (Math.random() < 0.03) {
                                if (tank.aiTurnDirection > 0) tank.turnRight();
                                else tank.turnLeft();
                            }
                            tank.moveForward(this.obstacles, this.tanks);
                        }

                        // Scan for enemies
                        if (Math.random() < 0.05) {
                            tank.turnRight();
                        }
                    }
                }
            }

            // Update position tracking
            tank.updateLastPosition();
        }
    }

    update() {
        if (!this.gameRunning) return;

        const now = Date.now();
        const dt = now - this.lastUpdate;

        if (dt >= CONFIG.TICK_RATE) {
            // Multiplayer mode: simplified update (server is authoritative)
            if (this.gameMode === 'multiplayer') {
                this.handleInput();
                this.interpolateRemotePlayers();

                // Update particles only
                for (let i = this.particles.length - 1; i >= 0; i--) {
                    this.particles[i].update();
                    if (this.particles[i].isDead()) {
                        this.particles.splice(i, 1);
                    }
                }

                this.lastUpdate = now;
                return;
            }

            // Practice mode: full local simulation
            // Update respawn timers
            for (let tank of this.tanks) {
                if (tank.respawning && tank.respawnTimer > 0) {
                    tank.respawnTimer -= dt;
                    if (tank.respawnTimer < 0) tank.respawnTimer = 0;
                }
            }

            this.handleInput();
            this.updateAI();

            // Update bullets
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                const bullet = this.bullets[i];
                bullet.update();

                // Check collisions (with friendly fire disabled)
                const hitTank = bullet.checkCollision(this.obstacles, this.tanks, bullet.ownerTeam);
                if (hitTank) {
                    // Spawn hit particles
                    this.spawnParticles(bullet.x, bullet.y, hitTank.color, 20);

                    const died = hitTank.takeDamage();

                    // Find shooter and award point to team
                    const shooter = this.tanks.find(t => t.id === bullet.ownerId);
                    if (shooter) {
                        // Track accuracy for AI learning
                        if (!shooter.isPlayer) {
                            shooter.shotsHit++;
                            shooter.consecutiveHits++;
                        }

                        if (died) {
                            // Award point to shooter's team
                            this.teamScores[shooter.team]++;
                            shooter.score++;
                            hitTank.deaths++;

                            // Spawn death explosion particles
                            this.spawnParticles(hitTank.x, hitTank.y, hitTank.color, 40);

                            // Boost confidence on kill
                            if (!shooter.isPlayer) {
                                shooter.aggressionLevel = Math.min(1.0, shooter.aggressionLevel + 0.1);
                            }

                            // Calculate respawn time (increases with deaths)
                            const respawnTime = Math.min(
                                CONFIG.BASE_RESPAWN_TIME + (hitTank.deaths - 1) * CONFIG.RESPAWN_INCREMENT,
                                CONFIG.MAX_RESPAWN_TIME
                            );

                            // Set respawning state
                            hitTank.respawning = true;
                            hitTank.respawnTimer = respawnTime;

                            // Respawn killed tank after timer
                            setTimeout(() => {
                                if (this.gameRunning && hitTank.respawning) {
                                    hitTank.respawn(this);
                                    hitTank.respawning = false;
                                    hitTank.respawnTimer = 0;
                                }
                            }, respawnTime);
                        }
                    }

                    this.bullets.splice(i, 1);
                } else if (!bullet.active) {
                    // Check if bullet hit obstacle (for particle effect)
                    if (bullet.x > 0 && bullet.x < CONFIG.CANVAS_WIDTH &&
                        bullet.y > 0 && bullet.y < CONFIG.CANVAS_HEIGHT) {
                        // Bullet hit obstacle
                        this.spawnParticles(bullet.x, bullet.y, '#888', 10);
                    }
                    this.bullets.splice(i, 1);
                }
            }

            // Update particles
            for (let i = this.particles.length - 1; i >= 0; i--) {
                this.particles[i].update();
                if (this.particles[i].isDead()) {
                    this.particles.splice(i, 1);
                }
            }

            // Check win condition - team based
            if (this.teamScores[1] >= CONFIG.WIN_SCORE) {
                this.endGame(1);
            } else if (this.teamScores[2] >= CONFIG.WIN_SCORE) {
                this.endGame(2);
            }

            this.updateUI();
            this.lastUpdate = now;
        }
    }

    draw() {
        // Clear canvas with game background
        this.ctx.fillStyle = '#2d4a3e';
        this.ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        // Draw grid
        this.drawGrid();

        // Draw obstacles
        this.ctx.fillStyle = '#1a2e24';
        for (let obs of this.obstacles) {
            this.ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            // Subtle darker edge
            this.ctx.strokeStyle = 'rgba(13, 23, 18, 0.5)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        }

        // Draw particles (behind everything)
        for (let particle of this.particles) {
            particle.draw(this.ctx);
        }

        // Draw bullets
        for (let bullet of this.bullets) {
            bullet.draw(this.ctx);
        }

        // Draw tanks
        for (let tank of this.tanks) {
            if (tank.health > 0 && !tank.respawning) {
                tank.draw(this.ctx);
            }
        }

        // Draw respawn timer for player
        if (this.playerTank && this.playerTank.respawning) {
            this.drawRespawnTimer();
        }
    }

    drawRespawnTimer() {
        const seconds = Math.ceil(this.playerTank.respawnTimer / 1000);

        // Semi-transparent overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        // Main respawn message
        this.ctx.fillStyle = '#ff4444';
        this.ctx.font = 'bold 120px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 8;
        this.ctx.strokeText('RESPAWNING', CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2 - 100);
        this.ctx.fillText('RESPAWNING', CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2 - 100);

        // Countdown timer
        this.ctx.fillStyle = '#ffff00';
        this.ctx.font = 'bold 200px Arial';
        this.ctx.strokeText(seconds, CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2 + 100);
        this.ctx.fillText(seconds, CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2 + 100);

        // Death count message
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '40px Arial';
        const deathMsg = `Deaths: ${this.playerTank.deaths} | Next respawn: ${Math.min(1 + this.playerTank.deaths * 2, 20)}s`;
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 4;
        this.ctx.strokeText(deathMsg, CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2 + 250);
        this.ctx.fillText(deathMsg, CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2 + 250);
    }

    drawGrid() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;

        for (let x = 0; x < CONFIG.CANVAS_WIDTH; x += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, CONFIG.CANVAS_HEIGHT);
            this.ctx.stroke();
        }

        for (let y = 0; y < CONFIG.CANVAS_HEIGHT; y += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(CONFIG.CANVAS_WIDTH, y);
            this.ctx.stroke();
        }
    }

    updateUI() {
        // Update health
        const healthContainer = document.getElementById('health-hearts');
        healthContainer.innerHTML = '';
        if (this.playerTank) {
            for (let i = 0; i < this.playerTank.health; i++) {
                const heart = document.createElement('div');
                heart.className = 'heart';
                healthContainer.appendChild(heart);
            }
        }

        // Update score - show team scores
        document.getElementById('score').textContent = `Green: ${this.teamScores[1]} | Red: ${this.teamScores[2]}`;

        // Update ammo indicator
        const ammoIndicator = document.getElementById('ammo-indicator');
        if (this.playerTank && this.playerTank.canShoot()) {
            ammoIndicator.className = 'ready';
        } else {
            ammoIndicator.className = 'cooling';
        }

        // Update scoreboard - show by teams
        const playerList = document.getElementById('player-list');
        playerList.innerHTML = '';

        // Team 1
        const team1Header = document.createElement('div');
        team1Header.innerHTML = '<strong style="color: #44ff44">Green Team: ' + this.teamScores[1] + '</strong>';
        team1Header.style.marginBottom = '5px';
        playerList.appendChild(team1Header);

        const team1Tanks = this.tanks.filter(t => t.team === 1).sort((a, b) => b.score - a.score);
        for (let tank of team1Tanks) {
            const item = document.createElement('div');
            item.className = 'player-item';
            if (tank.isPlayer) item.classList.add('current');

            item.innerHTML = `
                <span style="color: ${tank.color}">${tank.name}</span>
                <span>${tank.score}</span>
            `;
            playerList.appendChild(item);
        }

        // Team 2
        const team2Header = document.createElement('div');
        team2Header.innerHTML = '<strong style="color: #ff4444">Red Team: ' + this.teamScores[2] + '</strong>';
        team2Header.style.marginTop = '10px';
        team2Header.style.marginBottom = '5px';
        playerList.appendChild(team2Header);

        const team2Tanks = this.tanks.filter(t => t.team === 2).sort((a, b) => b.score - a.score);
        for (let tank of team2Tanks) {
            const item = document.createElement('div');
            item.className = 'player-item';

            item.innerHTML = `
                <span style="color: ${tank.color}">${tank.name}</span>
                <span>${tank.score}</span>
            `;
            playerList.appendChild(item);
        }
    }

    showGameOver(winningTeamName, stats) {
        // For multiplayer, use the stats provided by server
        const winningTeam = winningTeamName === 'Green' ? 1 : 2;
        const teamColor = winningTeam === 1 ? '#44ff44' : '#ff4444';
        const playerTank = stats.find(s => s.name === (this.playerTank ? this.playerTank.name : ''));
        const playerWon = playerTank && playerTank.team === winningTeam;

        document.getElementById('game-over-title').textContent = playerWon ? 'Victory!' : 'Defeat!';
        document.getElementById('game-over-message').innerHTML =
            `<span style="color: ${teamColor}">${winningTeamName} Team</span> wins!`;

        // Show final scoreboard
        const finalScoreboard = document.getElementById('final-scoreboard');
        finalScoreboard.innerHTML = '<h3>Final Scores</h3>';

        // Team 1
        const team1Header = document.createElement('div');
        team1Header.innerHTML = `<strong style="color: #44ff44">Green Team</strong>`;
        team1Header.style.margin = '10px 0 5px 0';
        if (winningTeam === 1) team1Header.style.fontSize = '20px';
        finalScoreboard.appendChild(team1Header);

        const team1Players = stats.filter(s => s.team === 1).sort((a, b) => b.score - a.score);
        team1Players.forEach((player) => {
            const item = document.createElement('div');
            item.className = 'final-player-item';
            item.innerHTML = `
                <span style="color: #00ff00">${player.name}</span>
                <span>${player.score} kills</span>
            `;
            finalScoreboard.appendChild(item);
        });

        // Team 2
        const team2Header = document.createElement('div');
        team2Header.innerHTML = `<strong style="color: #ff4444">Red Team</strong>`;
        team2Header.style.margin = '10px 0 5px 0';
        if (winningTeam === 2) team2Header.style.fontSize = '20px';
        finalScoreboard.appendChild(team2Header);

        const team2Players = stats.filter(s => s.team === 2).sort((a, b) => b.score - a.score);
        team2Players.forEach((player) => {
            const item = document.createElement('div');
            item.className = 'final-player-item';
            item.innerHTML = `
                <span style="color: #ff0000">${player.name}</span>
                <span>${player.score} kills</span>
            `;
            finalScoreboard.appendChild(item);
        });

        document.getElementById('game-over-overlay').style.display = 'flex';
    }

    endGame(winningTeam) {
        this.gameRunning = false;

        // Show game over screen
        const teamName = winningTeam === 1 ? 'Green Team' : 'Red Team';
        const teamColor = winningTeam === 1 ? '#44ff44' : '#ff4444';
        const playerWon = this.playerTank && this.playerTank.team === winningTeam;

        document.getElementById('game-over-title').textContent = playerWon ? 'Victory!' : 'Defeat!';
        document.getElementById('game-over-message').innerHTML =
            `<span style="color: ${teamColor}">${teamName}</span> wins with ${this.teamScores[winningTeam]} kills!`;

        // Show final scoreboard
        const finalScoreboard = document.getElementById('final-scoreboard');
        finalScoreboard.innerHTML = '<h3>Final Scores</h3>';

        // Team 1
        const team1Header = document.createElement('div');
        team1Header.innerHTML = `<strong style="color: #44ff44">Green Team: ${this.teamScores[1]}</strong>`;
        team1Header.style.margin = '10px 0 5px 0';
        if (winningTeam === 1) team1Header.style.fontSize = '20px';
        finalScoreboard.appendChild(team1Header);

        const team1Tanks = this.tanks.filter(t => t.team === 1).sort((a, b) => b.score - a.score);
        team1Tanks.forEach((tank) => {
            const item = document.createElement('div');
            item.className = 'final-player-item';

            item.innerHTML = `
                <span style="color: ${tank.color}">${tank.name}</span>
                <span>${tank.score} kills</span>
            `;
            finalScoreboard.appendChild(item);
        });

        // Team 2
        const team2Header = document.createElement('div');
        team2Header.innerHTML = `<strong style="color: #ff4444">Red Team: ${this.teamScores[2]}</strong>`;
        team2Header.style.margin = '10px 0 5px 0';
        if (winningTeam === 2) team2Header.style.fontSize = '20px';
        finalScoreboard.appendChild(team2Header);

        const team2Tanks = this.tanks.filter(t => t.team === 2).sort((a, b) => b.score - a.score);
        team2Tanks.forEach((tank) => {
            const item = document.createElement('div');
            item.className = 'final-player-item';

            item.innerHTML = `
                <span style="color: ${tank.color}">${tank.name}</span>
                <span>${tank.score} kills</span>
            `;
            finalScoreboard.appendChild(item);
        });

        document.getElementById('game-over-overlay').style.display = 'flex';
    }

    playAgain() {
        document.getElementById('game-over-overlay').style.display = 'none';
        this.initGame();
        this.startGameLoop();
    }

    startGameLoop() {
        const loop = () => {
            this.update();
            this.draw();

            if (this.gameRunning) {
                requestAnimationFrame(loop);
            }
        };
        loop();
    }
}

// ============================================
// INITIALIZE GAME
// ============================================

let game;

window.addEventListener('load', () => {
    game = new Game();
});
