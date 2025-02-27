const { WebSocketServer } = require('ws');

// Store connected clients
const clients = new Map();
let nextPlayerId = 1;

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Check if this is a WebSocket request
  if (event.headers.upgrade !== 'websocket') {
    return { statusCode: 426, body: 'Upgrade Required' };
  }

  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (socket) => {
    console.log(`New connection attempt...`);
    let playerData = {
        id: nextPlayerId++,
        position: { x: -50, y: 2, z: -45 },
        nickname: '',
        stamina: 5
    };
    
    clients.set(socket, playerData);

    socket.on('message', (message) => {
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
                const targetSocket = Array.from(clients.entries())
                    .find(([_, p]) => p.id === data.targetId)?.[0];
                
                if (targetSocket) {
                    const targetPlayer = clients.get(targetSocket);
                    targetPlayer.stamina--;
                    
                    broadcast({
                        type: 'playerHit',
                        targetId: data.targetId,
                        newStamina: (targetPlayer.stamina / 5) * 100
                    });
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
    });

    socket.on('close', () => {
        const player = clients.get(socket);
        console.log(`Player disconnected: ${player.nickname} (ID: ${player.id})`);
        
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

  return {
    statusCode: 101,
    headers: {
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
      'Sec-WebSocket-Accept': event.headers['Sec-WebSocket-Key']
    }
  };
}; 