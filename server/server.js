const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const RoomManager = require('./roomManager');

const app = express();
const httpServer = http.createServer(app);

// Serve client files from the docs directory
app.use(express.static(path.join(__dirname, '../docs')));

// CORS configuration (still useful for external clients)
const CLIENT_URL = process.env.CLIENT_URL || '*';
app.use(cors({ origin: CLIENT_URL }));

// Socket.io setup
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const roomManager = new RoomManager(io);

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: Date.now(),
        rooms: roomManager.getRoomCount(),
        players: roomManager.getPlayerCount()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'Tank Shooter Server',
        version: '1.0.0',
        rooms: roomManager.getRoomCount(),
        players: roomManager.getPlayerCount()
    });
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`[${new Date().toISOString()}] Player connected: ${socket.id}`);

    // Create room
    socket.on('createRoom', ({ playerName }) => {
        try {
            const result = roomManager.createRoom(socket.id, playerName);
            socket.join(result.roomCode);
            socket.emit('roomCreated', result);
            console.log(`[${new Date().toISOString()}] Room created: ${result.roomCode} by ${playerName}`);
        } catch (error) {
            socket.emit('error', { message: error.message });
            console.error(`[${new Date().toISOString()}] Create room error:`, error.message);
        }
    });

    // Join room
    socket.on('joinRoom', ({ roomCode, playerName }) => {
        try {
            const result = roomManager.joinRoom(roomCode.toUpperCase(), socket.id, playerName);
            socket.join(roomCode.toUpperCase());
            socket.emit('roomJoined', result);

            // Notify other players
            socket.to(roomCode.toUpperCase()).emit('playerJoined', {
                player: result.players.find(p => p.id === socket.id)
            });

            console.log(`[${new Date().toISOString()}] ${playerName} joined room: ${roomCode}`);
        } catch (error) {
            socket.emit('error', { message: error.message });
            console.error(`[${new Date().toISOString()}] Join room error:`, error.message);
        }
    });

    // Start game
    socket.on('startGame', () => {
        try {
            const room = roomManager.getPlayerRoom(socket.id);
            if (!room) {
                socket.emit('error', { message: 'Not in a room' });
                return;
            }

            if (room.hostId !== socket.id) {
                socket.emit('error', { message: 'Only host can start the game' });
                return;
            }

            const result = room.startGame();
            io.to(room.code).emit('gameStart', result);
            console.log(`[${new Date().toISOString()}] Game started in room: ${room.code}`);
        } catch (error) {
            socket.emit('error', { message: error.message });
            console.error(`[${new Date().toISOString()}] Start game error:`, error.message);
        }
    });

    // Player input
    socket.on('playerInput', (inputData) => {
        try {
            const room = roomManager.getPlayerRoom(socket.id);
            if (room && room.gameServer) {
                room.processInput(socket.id, inputData);
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Input error:`, error.message);
        }
    });

    // Switch team
    socket.on('switchTeam', ({ team }) => {
        try {
            const room = roomManager.getPlayerRoom(socket.id);
            if (!room) {
                socket.emit('error', { message: 'Not in a room' });
                return;
            }

            if (room.state !== 'lobby') {
                socket.emit('error', { message: 'Cannot switch teams after game started' });
                return;
            }

            room.switchPlayerTeam(socket.id, team);
            io.to(room.code).emit('teamChanged', {
                playerId: socket.id,
                team: team,
                players: room.getPlayerList()
            });

            console.log(`[${new Date().toISOString()}] Player ${socket.id} switched to team ${team} in room ${room.code}`);
        } catch (error) {
            socket.emit('error', { message: error.message });
            console.error(`[${new Date().toISOString()}] Switch team error:`, error.message);
        }
    });

    // Add bot
    socket.on('addBot', ({ team }) => {
        try {
            const room = roomManager.getPlayerRoom(socket.id);
            if (!room) {
                socket.emit('error', { message: 'Not in a room' });
                return;
            }

            if (room.state !== 'lobby') {
                socket.emit('error', { message: 'Cannot add bots after game started' });
                return;
            }

            room.addBot(team);
            io.to(room.code).emit('botAdded', {
                team: team,
                players: room.getPlayerList()
            });

            console.log(`[${new Date().toISOString()}] Bot added to team ${team} in room ${room.code}`);
        } catch (error) {
            socket.emit('error', { message: error.message });
            console.error(`[${new Date().toISOString()}] Add bot error:`, error.message);
        }
    });

    // Leave room
    socket.on('leaveRoom', () => {
        handleDisconnect(socket.id);
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log(`[${new Date().toISOString()}] Player disconnected: ${socket.id}`);
        handleDisconnect(socket.id);
    });

    function handleDisconnect(playerId) {
        const room = roomManager.getPlayerRoom(playerId);
        if (room) {
            const wasRemoved = roomManager.handleDisconnect(playerId);

            if (wasRemoved) {
                // Player was removed (grace period or not in game)
                io.to(room.code).emit('playerLeft', { playerId });
            } else {
                // Player is in game, converted to bot
                io.to(room.code).emit('playerDisconnected', { playerId });
            }
        }
    }
});

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] Tank Shooter server running on port ${PORT}`);
    console.log(`[${new Date().toISOString()}] Client URL: ${CLIENT_URL}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[${new Date().toISOString()}] SIGTERM received, shutting down gracefully');
    httpServer.close(() => {
        console.log('[${new Date().toISOString()}] Server closed');
        process.exit(0);
    });
});
