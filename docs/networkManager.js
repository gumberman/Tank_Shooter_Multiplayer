/**
 * Network Manager - Socket.io client wrapper
 * Handles all client-server communication
 */
class NetworkManager {
    constructor() {
        this.socket = null;
        this.serverUrl = window.location.hostname === 'localhost'
            ? 'http://localhost:3001'
            : 'https://tank-shooter-multiplayer.onrender.com';
        this.connected = false;
        this.playerId = null;
        this.roomCode = null;
        this.sequenceNumber = 0;
        this.eventHandlers = new Map();
    }

    /**
     * Connect to server
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.connected) {
                resolve();
                return;
            }

            this.socket = io(this.serverUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 5
            });

            this.socket.on('connect', () => {
                console.log('Connected to server:', this.socket.id);
                this.connected = true;
                this.playerId = this.socket.id;
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                reject(error);
            });

            this.socket.on('disconnect', (reason) => {
                console.log('Disconnected from server:', reason);
                this.connected = false;
                this.trigger('disconnect', { reason });
            });

            // Forward all server events to registered handlers
            const events = [
                'roomCreated',
                'roomJoined',
                'playerJoined',
                'playerLeft',
                'playerDisconnected',
                'teamChanged',
                'gameStart',
                'gameState',
                'gameOver',
                'error'
            ];

            events.forEach(eventName => {
                this.socket.on(eventName, (data) => {
                    this.trigger(eventName, data);
                });
            });
        });
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
            this.playerId = null;
            this.roomCode = null;
        }
    }

    /**
     * Create a new room
     */
    createRoom(playerName) {
        if (!this.connected) {
            throw new Error('Not connected to server');
        }
        this.socket.emit('createRoom', { playerName });
    }

    /**
     * Join an existing room
     */
    joinRoom(roomCode, playerName) {
        if (!this.connected) {
            throw new Error('Not connected to server');
        }
        this.roomCode = roomCode;
        this.socket.emit('joinRoom', { roomCode, playerName });
    }

    /**
     * Start the game (host only)
     */
    startGame() {
        if (!this.connected) {
            throw new Error('Not connected to server');
        }
        this.socket.emit('startGame');
    }

    /**
     * Send player input to server
     */
    sendInput(input) {
        if (!this.connected) return;

        this.sequenceNumber++;
        this.socket.emit('playerInput', {
            seq: this.sequenceNumber,
            input: input,
            timestamp: Date.now()
        });
    }

    /**
     * Switch team in lobby
     */
    switchTeam(team) {
        if (!this.connected) return;
        this.socket.emit('switchTeam', { team });
    }

    /**
     * Leave current room
     */
    leaveRoom() {
        if (!this.connected) return;
        this.socket.emit('leaveRoom');
        this.roomCode = null;
    }

    /**
     * Register event handler
     */
    on(eventName, handler) {
        if (!this.eventHandlers.has(eventName)) {
            this.eventHandlers.set(eventName, []);
        }
        this.eventHandlers.get(eventName).push(handler);
    }

    /**
     * Remove event handler
     */
    off(eventName, handler) {
        if (!this.eventHandlers.has(eventName)) return;

        const handlers = this.eventHandlers.get(eventName);
        const index = handlers.indexOf(handler);
        if (index > -1) {
            handlers.splice(index, 1);
        }
    }

    /**
     * Trigger event handlers
     */
    trigger(eventName, data) {
        if (!this.eventHandlers.has(eventName)) return;

        const handlers = this.eventHandlers.get(eventName);
        for (const handler of handlers) {
            try {
                handler(data);
            } catch (error) {
                console.error(`Error in ${eventName} handler:`, error);
            }
        }
    }

    /**
     * Get connection status
     */
    isConnected() {
        return this.connected;
    }

    /**
     * Get player ID
     */
    getPlayerId() {
        return this.playerId;
    }

    /**
     * Get room code
     */
    getRoomCode() {
        return this.roomCode;
    }
}
