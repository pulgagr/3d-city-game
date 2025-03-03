const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();

// Add basic error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve main game file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Map();
let nextPlayerId = 1;

// WebSocket connection handler
wss.on('connection', (socket, req) => {
    console.log(`New connection from ${req.socket.remoteAddress}`);
    
    let playerData = {
        id: nextPlayerId++,
        position: { x: -50, y: 2, z: -45 },
        nickname: '',
        stamina: 5
    };
    
    clients.set(socket, playerData);

    socket.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const player = clients.get(socket);

            switch (data.type) {
                case 'init':
                    player.nickname = data.nickname;
                    console.log(`Player connected: ${player.nickname} (ID: ${player.id})`);
                    
                    socket.send(JSON.stringify({
                        type: 'init',
                        id: player.id,
                        players: Array.from(clients.values())
                    }));

                    broadcast({
                        type: 'playerJoined',
                        player: player
                    }, socket);
                    break;

                case 'position':
                    player.position = data.position;
                    broadcast({
                        type: 'playerMoved',
                        id: player.id,
                        position: data.position,
                        nickname: player.nickname
                    }, socket);
                    break;

                case 'playerHit':
                    // Find the player who was hit
                    const hitPlayerEntry = Array.from(clients.entries())
                        .find(([_, p]) => p.id === data.hitPlayerId);
                    
                    if (hitPlayerEntry) {
                        const [hitSocket, hitPlayer] = hitPlayerEntry;
                        // Reduce stamina
                        hitPlayer.stamina = Math.max(0, hitPlayer.stamina - 1);
                        
                        // Broadcast hit to all players
                        broadcast({
                            type: 'playerHit',
                            hitPlayerId: data.hitPlayerId,
                            targetId: data.hitPlayerId,
                            newStamina: hitPlayer.stamina
                        });
                        
                        // Check if player is now out of stamina
                        if (hitPlayer.stamina <= 0) {
                            // Reset stamina
                            hitPlayer.stamina = 5;
                            
                            // Broadcast explosion
                            broadcast({
                                type: 'playerExploded',
                                playerId: data.hitPlayerId
                            });
                        }
                    }
                    break;
                    
                case 'playerExploded':
                    broadcast({
                        type: 'playerExploded',
                        playerId: data.playerId
                    });
                    break;

                default:
                    broadcast(data, socket);
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });

    socket.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    socket.on('close', () => {
        const player = clients.get(socket);
        if (player) {
            console.log(`Player disconnected: ${player.nickname} (ID: ${player.id})`);
            
            broadcast({
                type: 'playerLeft',
                id: player.id,
                nickname: player.nickname
            });
            
            clients.delete(socket);
        }
    });
});

function broadcast(message, exclude = null) {
    const data = JSON.stringify(message);
    for (const [client] of clients) {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            try {
                client.send(data);
            } catch (error) {
                console.error('Error broadcasting to client:', error);
            }
        }
    }
}

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Waiting for players to connect...');
});

// Handle server shutdown gracefully
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

module.exports = app; 