const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Create HTTP server
const httpServer = http.createServer((req, res) => {
    if (req.url === '/') {
        // Serve the game HTML
        fs.readFile(path.join(__dirname, '3d-city-game.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading game');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    }
});

// Create WebSocket server attached to HTTP server
const wss = new WebSocket.Server({ server: httpServer });

const clients = new Map();
let nextPlayerId = 1;

wss.on('connection', (socket) => {
    console.log(`New connection attempt...`);
    let playerData = {
        id: nextPlayerId++,
        position: { x: -50, y: 2, z: -45 },
        nickname: ''
    };
    
    clients.set(socket, playerData);

    socket.on('message', (message) => {
        const data = JSON.parse(message);
        const player = clients.get(socket);

        switch (data.type) {
            case 'init':
                // Set player nickname
                player.nickname = data.nickname;
                console.log(`Player connected: ${player.nickname} (ID: ${player.id})`);
                
                // Send the new player their ID and current world state
                socket.send(JSON.stringify({
                    type: 'init',
                    id: player.id,
                    players: Array.from(clients.values())
                }));

                // Broadcast new player to all other players
                broadcast({
                    type: 'playerJoined',
                    player: player
                }, socket);
                break;

            case 'position':
                // Update player position
                player.position = data.position;
                // Broadcast position to all other players
                broadcast({
                    type: 'playerMoved',
                    id: player.id,
                    position: data.position,
                    nickname: player.nickname
                }, socket);
                break;

            case 'punch':
                // Broadcast punch action
                broadcast({
                    type: 'playerPunched',
                    id: player.id,
                    position: data.position
                }, socket);
                break;

            case 'destroyBuilding':
                // Broadcast building destruction
                broadcast({
                    type: 'buildingDestroyed',
                    position: data.position
                });
                break;
        }
    });

    socket.on('close', () => {
        const player = clients.get(socket);
        console.log(`Player disconnected: ${player.nickname} (ID: ${player.id})`);
        
        // Broadcast player disconnection
        broadcast({
            type: 'playerLeft',
            id: player.id,
            nickname: player.nickname
        });
        
        clients.delete(socket);
    });
});

function broadcast(message, exclude = null) {
    const data = JSON.stringify(message);
    for (const [client] of clients) {
        if (client !== exclude) {
            client.send(data);
        }
    }
}

// Start server
const PORT = 8080;
httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Waiting for players to connect...');
}); 