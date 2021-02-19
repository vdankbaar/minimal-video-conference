const useHTTPS = false;
const hostOwnStunServer = false;
const webPort = 3000
const stunPort = 19302;

if (hostOwnStunServer) {
    const stun = require('stun');
    const stunServer = stun.createServer({ type: 'udp4' });
    const { STUN_BINDING_RESPONSE, STUN_EVENT_BINDING_REQUEST } = stun.constants;
    const userAgent = `node/${process.version} stun/v1.0.0`;
    stunServer.on(STUN_EVENT_BINDING_REQUEST, (request, rinfo) => {
        const message = stun.createMessage(STUN_BINDING_RESPONSE, request.transactionId);
        message.addXorAddress(rinfo.address, rinfo.port);
        message.addSoftware(userAgent);
        stunServer.send(message, rinfo.port, rinfo.address);
    });

    stunServer.listen(stunPort, function() {
        console.log("Stun server started on port " + stunPort.toString());
    });
}


const express = require('express');
const app = express();
let server;
if (useHTTPS) {
    const fs = require('fs');
    //Don't forget to provide these certs if you want to use HTTPS!
    const options = {
        key: fs.readFileSync('certs/key.pem'),
        cert: fs.readFileSync('certs/cert.pem')
    };
    server = require('https').createServer(options, app)
}
else
{
    server = require('http').createServer(app);
}

const io = require('socket.io')(server);
app.use('/', express.static('public'));

io.on('connection', function(socket) {
    let socketData = {id: "", roomId: ""};
    socket.on('join', function(roomId) {
        let roomClientCount = io.sockets.adapter.rooms.get(roomId) ? io.sockets.adapter.rooms.get(roomId).length : 0
        socketData.id = socket.id;
        socketData.roomId = roomId;
        socket.join(roomId);
        if (roomClientCount == 0) {
            console.log("Creating room " + roomId.toString() + " and emitting room_created socket event");
            socket.emit('room_created', roomId);
        } else {
            console.log(socket.id.toString() + " is joining room " + roomId.toString() + ", emitting join_call socket event");
            socket.broadcast.to(roomId).emit('join_call', socket.id);
        }
    })

    socket.on('webrtc_offer', (event) => {
        console.log("Transmitting offer from " + event.originId + " to " + event.targetId);
        socket.broadcast.to(event.targetId).emit('webrtc_offer', event);
    });

    socket.on('webrtc_answer', (event) => {
        console.log("Transmitting answer from " + event.originId + " to " + event.targetId);
        socket.broadcast.to(event.targetId).emit('webrtc_answer', event);
    });

    socket.on('webrtc_ice_candidate', (event) => {
        console.log("Broadcasting webrtc_ice_candidate event to peers in room " + event.roomId.toString());
        socket.broadcast.to(event.roomId).emit('webrtc_ice_candidate', event);
    });

    socket.on('disconnect', () => {
        console.log(socketData.id + " disconnected from room " + socketData.roomId);
        if (socketData.roomId!="" && socketData.id!="")
            io.to(socketData.roomId).emit('client-disconnect', socketData.id);
    });
    
})

server.listen(webPort, function() {
    console.log("Express server listening on port " + webPort.toString());
});