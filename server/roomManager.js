const Room = require('./room');
const { NETWORK } = require('../shared/constants');

class RoomManager {
    constructor(io) {
        this.io = io;
        this.rooms = new Map(); // roomCode -> Room
        this.playerRooms = new Map(); // playerId -> roomCode
        this.disconnectTimers = new Map(); // playerId -> timeoutId
    }

    /**
     * Generate a random 6-character room code
     * Excludes confusing characters (0, O, I, 1)
     */
    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < NETWORK.ROOM_CODE_LENGTH; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    /**
     * Create a new room
     */
    createRoom(playerId, playerName) {
        // Generate unique room code
        let roomCode;
        do {
            roomCode = this.generateRoomCode();
        } while (this.rooms.has(roomCode));

        // Create room
        const room = new Room(roomCode, playerId, this.io);
        room.addPlayer(playerId, playerName);

        this.rooms.set(roomCode, room);
        this.playerRooms.set(playerId, roomCode);

        return {
            roomCode,
            playerId,
            seed: room.seed,
            players: room.getPlayerList()
        };
    }

    /**
     * Join an existing room
     */
    joinRoom(roomCode, playerId, playerName) {
        const room = this.rooms.get(roomCode);

        if (!room) {
            throw new Error('Room not found');
        }

        if (room.isFull()) {
            throw new Error('Room is full');
        }

        if (room.state === 'playing') {
            throw new Error('Game already started');
        }

        room.addPlayer(playerId, playerName);
        this.playerRooms.set(playerId, roomCode);

        return {
            roomCode,
            players: room.getPlayerList(),
            seed: room.seed
        };
    }

    /**
     * Handle player disconnection
     * Returns true if player was removed, false if converted to bot
     */
    handleDisconnect(playerId) {
        const roomCode = this.playerRooms.get(playerId);
        if (!roomCode) return false;

        const room = this.rooms.get(roomCode);
        if (!room) return false;

        // Clear any existing disconnect timer
        if (this.disconnectTimers.has(playerId)) {
            clearTimeout(this.disconnectTimers.get(playerId));
            this.disconnectTimers.delete(playerId);
        }

        // If game is not started, remove player immediately
        if (room.state !== 'playing') {
            room.removePlayer(playerId);
            this.playerRooms.delete(playerId);

            // Clean up empty room
            if (room.isEmpty()) {
                this.rooms.delete(roomCode);
            }

            return true;
        }

        // If game is playing, start grace period
        const timer = setTimeout(() => {
            // Convert to bot after grace period
            if (room.gameServer) {
                room.gameServer.convertPlayerToBot(playerId);
            }
            this.playerRooms.delete(playerId);
            this.disconnectTimers.delete(playerId);
        }, NETWORK.DISCONNECT_GRACE_PERIOD);

        this.disconnectTimers.set(playerId, timer);
        return false;
    }

    /**
     * Handle player reconnection (within grace period)
     */
    handleReconnect(playerId) {
        if (this.disconnectTimers.has(playerId)) {
            clearTimeout(this.disconnectTimers.get(playerId));
            this.disconnectTimers.delete(playerId);
            return true;
        }
        return false;
    }

    /**
     * Get room for a player
     */
    getPlayerRoom(playerId) {
        const roomCode = this.playerRooms.get(playerId);
        return roomCode ? this.rooms.get(roomCode) : null;
    }

    /**
     * Get total room count
     */
    getRoomCount() {
        return this.rooms.size;
    }

    /**
     * Get total player count
     */
    getPlayerCount() {
        return this.playerRooms.size;
    }

    /**
     * Clean up finished games
     */
    cleanupFinishedGames() {
        for (const [roomCode, room] of this.rooms.entries()) {
            if (room.state === 'finished' && room.isEmpty()) {
                this.rooms.delete(roomCode);
            }
        }
    }
}

module.exports = RoomManager;
