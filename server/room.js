const GameServer = require('./gameServer');
const { NETWORK } = require('../shared/constants');

class Room {
    constructor(code, hostId, io) {
        this.code = code;
        this.hostId = hostId;
        this.io = io;
        this.players = new Map(); // playerId -> {id, name, team}
        this.state = 'lobby'; // lobby, playing, finished
        this.seed = Math.random(); // Seed for obstacle generation
        this.gameServer = null;
        this.createdAt = Date.now();
    }

    /**
     * Add a player to the room
     */
    addPlayer(playerId, playerName) {
        if (this.isFull()) {
            throw new Error('Room is full');
        }

        // Auto-assign team (balance teams)
        const team = this.getBalancedTeam();

        this.players.set(playerId, {
            id: playerId,
            name: playerName,
            team: team
        });
    }

    /**
     * Remove a player from the room
     */
    removePlayer(playerId) {
        this.players.delete(playerId);

        // If host leaves, assign new host
        if (playerId === this.hostId && this.players.size > 0) {
            this.hostId = this.players.keys().next().value;
        }
    }

    /**
     * Switch player's team
     */
    switchPlayerTeam(playerId, newTeam) {
        const player = this.players.get(playerId);
        if (!player) {
            throw new Error('Player not found in room');
        }

        if (newTeam !== 1 && newTeam !== 2) {
            throw new Error('Invalid team number');
        }

        player.team = newTeam;
    }

    /**
     * Add a bot to specified team
     */
    addBot(team) {
        if (this.isFull()) {
            throw new Error('Room is full');
        }

        if (team !== 1 && team !== 2) {
            throw new Error('Invalid team number');
        }

        // Count bots on this team
        let teamBotCount = 0;
        for (const player of this.players.values()) {
            if (player.team === team && player.id.startsWith('lobby_bot_')) {
                teamBotCount++;
            }
        }

        const botId = `lobby_bot_${team}_${Date.now()}`;
        const botName = `Bot ${teamBotCount + 1}`;

        this.players.set(botId, {
            id: botId,
            name: botName,
            team: team,
            isBot: true
        });
    }

    /**
     * Get team assignment that balances teams
     */
    getBalancedTeam() {
        let team1Count = 0;
        let team2Count = 0;

        for (const player of this.players.values()) {
            if (player.team === 1) team1Count++;
            else team2Count++;
        }

        return team1Count <= team2Count ? 1 : 2;
    }

    /**
     * Start the game
     */
    startGame() {
        if (this.state !== 'lobby') {
            throw new Error('Game already started');
        }

        if (this.players.size < NETWORK.MIN_ROOM_PLAYERS) {
            throw new Error(`Need at least ${NETWORK.MIN_ROOM_PLAYERS} players to start`);
        }

        this.state = 'playing';
        this.gameServer = new GameServer(this, this.io);
        this.gameServer.start();

        return {
            seed: this.seed,
            players: this.getPlayerList(),
            startTime: Date.now()
        };
    }

    /**
     * Process player input
     */
    processInput(playerId, inputData) {
        if (this.gameServer) {
            this.gameServer.processPlayerInput(playerId, inputData);
        }
    }

    /**
     * Handle game over - return room to lobby state so players can play again
     */
    endGame(winningTeam, teamScores, stats) {
        this.state = 'lobby';
        if (this.gameServer) {
            this.gameServer.stop();
            this.gameServer = null;
        }

        this.io.to(this.code).emit('gameOver', {
            winningTeam,
            teamScores,
            stats,
            players: this.getPlayerList()
        });
    }

    /**
     * Remove a specific bot from the lobby
     */
    removeMember(memberId) {
        this.players.delete(memberId);
        // If host was removed (shouldn't happen, but just in case), assign new host
        if (memberId === this.hostId && this.players.size > 0) {
            // Find first non-bot player
            for (const [id, p] of this.players.entries()) {
                if (!p.isBot) { this.hostId = id; break; }
            }
        }
    }

    /**
     * Get list of players
     */
    getPlayerList() {
        return Array.from(this.players.values());
    }

    /**
     * Check if room is full
     */
    isFull() {
        return this.players.size >= NETWORK.MAX_ROOM_PLAYERS;
    }

    /**
     * Check if room is empty
     */
    isEmpty() {
        return this.players.size === 0;
    }
}

module.exports = Room;
