// Shared constants for both client and server
// Dual export format: works in both Node.js and browser

(function(exports) {
    // Game Configuration
    exports.CONFIG = {
        CANVAS_WIDTH: 2400,
        CANVAS_HEIGHT: 2400,
        TANK_SIZE: 120,
        TANK_SPEED: 5,
        BULLET_SPEED: 17,
        BULLET_RADIUS: 12,
        SHOOT_COOLDOWN: 1000, // ms
        MAX_HEALTH: 3,
        WIN_SCORE: 24,
        ROTATION_SPEED: 2,
        NUM_OBSTACLES: 6, // Fixed for multiplayer consistency
        TICK_RATE: 16, // Client render rate
        SERVER_TICK_RATE: 60, // Server update rate (ms)
        MAX_TEAM_SIZE: 3,
        BASE_RESPAWN_TIME: 1000,
        RESPAWN_INCREMENT: 2000,
        MAX_RESPAWN_TIME: 20000,
        INTERPOLATION_DELAY: 100, // ms - render 100ms in past
        SNAPSHOT_RATE: 500, // ms - full snapshot interval
    };

    // Team colors
    exports.TEAM_COLORS = {
        1: '#00ff00', // Green team
        2: '#ff0000'  // Red team
    };

    // Network constants
    exports.NETWORK = {
        MAX_ROOM_PLAYERS: 6,
        MIN_ROOM_PLAYERS: 2,
        ROOM_CODE_LENGTH: 6,
        DISCONNECT_GRACE_PERIOD: 5000, // ms
        MAX_INPUT_RATE: 100, // inputs per second per player
        POSITION_CORRECTION_THRESHOLD: 50, // px - snap if diff > this
        POSITION_LERP_THRESHOLD: 10, // px - smooth if diff > this
    };

})(typeof exports === 'undefined' ? this : exports);
