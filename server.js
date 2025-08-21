const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Use Render's assigned port
const PORT = process.env.PORT || 3000;

// Serve static files from the public folder
app.use(express.static(__dirname + '/public'));

// Store all players
const players = {};
// Store all ground items
const groundItems = {};
const MAX_STACK_SIZE = 50;

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Player joins the game
    socket.on('join', (data) => {
        players[socket.id] = {
            id: socket.id,
            username: data.username,
            x: Math.random() * 600 + 100,
            y: Math.random() * 400 + 100,
            color: data.color || '#8b5a2b',
            rotation: 0,
            equippedItem: null
        };

        socket.emit('groundItems', groundItems);
        io.emit('players', players);
    });

    // Player movement
    socket.on('move', (data) => {
        const player = players[socket.id];
        if (!player) return;

        player.x += data.dx;
        player.y += data.dy;
        if (typeof data.rotation !== 'undefined') player.rotation = data.rotation;

        io.emit('players', players);
    });

    // Player equips/unequips items
    socket.on('equipItem', (itemData) => {
        if (players[socket.id]) {
            players[socket.id].equippedItem = itemData;
            io.emit('players', players);
        }
    });
    socket.on('unequipItem', () => {
        if (players[socket.id]) {
            players[socket.id].equippedItem = null;
            io.emit('players', players);
        }
    });

    // Drop items with stacking
    socket.on('dropItem', (data) => {
        const player = players[socket.id];
        if (!player) return;

        const dropDistance = 50;
        let stackFound = false;

        for (let id in groundItems) {
            const existingItem = groundItems[id];
            const dx = data.x - existingItem.x;
            const dy = data.y - existingItem.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (
                distance < dropDistance &&
                existingItem.item.id === data.item.id &&
                existingItem.item.count < MAX_STACK_SIZE
            ) {
                existingItem.item.count += 1;
                io.emit('itemUpdated', existingItem);
                stackFound = true;
                break;
            }
        }

        if (!stackFound) {
            const itemId = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const itemData = {
                id: data.item.id || 'unknown',
                name: data.item.name || 'Unknown Item',
                type: data.item.type || 'resource',
                count: 1,
                slot: data.item.slot || 0,
                image: data.item.image || ''
            };
            groundItems[itemId] = {
                id: itemId,
                item: itemData,
                x: data.x,
                y: data.y,
                timestamp: Date.now()
            };
            io.emit('itemDropped', groundItems[itemId]);
        }
    });

    // Pickup items
    socket.on('pickupItem', (itemId) => {
        const item = groundItems[itemId];
        if (!item) return;

        const pickupItem = JSON.parse(JSON.stringify(item));
        pickupItem.item.count = 1;

        item.item.count -= 1;

        if (item.item.count <= 0) {
            delete groundItems[itemId];
            io.emit('itemRemoved', itemId);
        } else {
            io.emit('itemUpdated', item);
        }

        socket.emit('itemPickedUp', pickupItem);
    });

    // Update color
    socket.on('updateColor', (color) => {
        if (players[socket.id]) {
            players[socket.id].color = color;
            io.emit('players', players);
        }
    });

    // Chat messages
    socket.on('chat', (message) => {
        if (players[socket.id]) {
            io.emit('chat', {
                username: players[socket.id].username,
                message: message
            });
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('players', players);
        console.log(`Player disconnected: ${socket.id}`);
    });
});

// Start server
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
