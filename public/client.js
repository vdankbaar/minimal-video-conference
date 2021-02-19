// Elements
let roomSelectScreen = document.getElementById('roomSelect');
let roomInput = document.getElementById('room-input');
let connectButton = document.getElementById('connect-button');
let roomScreen = document.getElementById("roomScreen");
let videoGrid = document.getElementById('videoGrid');
let localVideoDiv = document.getElementById('localVideoDiv');

// Variables
let localColor = "#007700";
let socket = io();
let mediaConstraints = {
    audio: {
        echoCancellation: true
    },
    video: { width: 1280, height: 720 },
}
let localStream;
let peerStreams;
let peerConnections = {};
let peerColors = {};
let addedStreams = [];
let roomId;

//Some free stun servers provided by google. If you are hosting your own stun server, change localhost to whatever domain you are hosting the site on and uncomment the line.
let iceServers = {
    iceServers: [
        {urls: 'stun:stun.l.google.com:19302'},
        {urls: 'stun:stun1.l.google.com:19302'},
        //{urls: 'stun:localhost:19302'}
    ],
}

connectButton.onclick = async function()
{
    let newRoomId = roomInput.value;
    if (!newRoomId)
        alert("That is not a valid room id!");
    else
    {
        //Transmit room join
        roomId = newRoomId;
        await setLocalStream(mediaConstraints);
        socket.emit('join', newRoomId);
        
        //Show room layout
        roomSelectScreen.style = 'display: none'
        roomScreen.style = 'display: block'
        localColor = "#" + (Math.floor(Math.random() * 200+25)).toString(16)+(Math.floor(Math.random() * 200+25)).toString(16)+(Math.floor(Math.random() * 200+25)).toString(16);
        localVideoDiv.style.backgroundColor = localColor;
    }
}

//Use this if you want to do something special when a user is the first in a new room
socket.on('room_created', async function() {
    console.log('Created new room! Others will be joining shortly!');
});

//This is event is called when a new user joins the call
socket.on('join_call', async (id) => {
    console.log(id.toString()+" is joining the call!");
    
    //Create new a new p2p connection
    peerConnections[id] = new RTCPeerConnection(iceServers);
    
    //Mark local stream for transmission (audio & video)
    localStream.getTracks().forEach((track) => {
        peerConnections[id].addTrack(track, localStream);
    });
    
    //What to do when a peer stream is received
    peerConnections[id].ontrack = function (trackEvent) { trackEvent.id=id; addStream(trackEvent); };
    
    //What to do when an ice candidate has been added
    peerConnections[id].onicecandidate = sendIceCandidate;

    //Retrieve a session description
    let sessionDescription
    try {
        sessionDescription = await peerConnections[id].createOffer()
        peerConnections[id].setLocalDescription(sessionDescription)
    } catch (error) {
        console.error(error)
    }

    //Transmit the webrtc offer
    console.log("Sending offer to new client!");
    socket.emit('webrtc_offer', {
        type: 'webrtc_offer',
        sdp: sessionDescription,
        targetId: id,
        originId: socket.id,
        remoteColor: localColor,
        roomId,
    });
});

socket.on('webrtc_offer', async (event) => {
    console.log("Received offer from peer!");
    peerConnections[event.originId] = new RTCPeerConnection(iceServers);
    peerColors[event.originId] = event.remoteColor;
    localStream.getTracks().forEach((track) => {
        peerConnections[event.originId].addTrack(track, localStream);
    });
    peerConnections[event.originId].setRemoteDescription(new RTCSessionDescription(event.sdp));
    peerConnections[event.originId].ontrack = function (trackEvent) { trackEvent.id=event.originId; addStream(trackEvent); };
    peerConnections[event.originId].onicecandidate = sendIceCandidate;
    let sessionDescription
    try {
        sessionDescription = await peerConnections[event.originId].createAnswer()
        peerConnections[event.originId].setLocalDescription(sessionDescription)
    } catch (error) {
        console.error(error)
    }

    console.log("Sending answer to peer!");
    socket.emit('webrtc_answer', {
        type: 'webrtc_answer',
        sdp: sessionDescription,
        originId: socket.id,
        targetId: event.originId,
        remoteColor: localColor,
        roomId,
    });
});

socket.on('webrtc_answer', (event) => {
    console.log("Received answer from new client!");
    peerColors[event.originId] = event.remoteColor;
    peerConnections[event.originId].setRemoteDescription(new RTCSessionDescription(event.sdp));
});

socket.on('webrtc_ice_candidate', (event) => {
    console.log("Received ice candidate!");
    // ICE candidate configuration.
    var candidate = new RTCIceCandidate({
        sdpMLineIndex: event.label,
        candidate: event.candidate,
    });
    peerConnections[event.originId].addIceCandidate(candidate)
});

socket.on('client-disconnect', async function(id) {
    console.log(id + " has disconnected!");
    peerConnections[id].close();
    delete peerConnections[id];
    delete peerColors[id];
    for (let video of videoGrid.children)
        if (video.getAttribute("streamId")==id)
            video.parentNode.removeChild(video);
});

async function setLocalStream(mediaConstraints) {
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    } catch (error) {
        console.error('Could not get user media', error)
    }
    localStream = stream;
    localVideoDiv.children[0].srcObject = stream;
}

function addStream(event) {
    if (!addedStreams.includes(event.id)) {
        console.log("Adding stream to video grid!");
        let videoDiv = document.createElement("div");
        videoDiv.style.backgroundColor = peerColors[event.id];
        videoDiv.setAttribute("streamId", event.id);
        let newVideo = document.createElement("video");
        addedStreams.push(event.id);
        newVideo.autoplay = "autoplay";
        newVideo.srcObject = event.streams[0];
        videoDiv.appendChild(newVideo);
        videoGrid.appendChild(videoDiv);
    }
}

function sendIceCandidate(event) {
    if (event.candidate) {
        socket.emit('webrtc_ice_candidate', {
            roomId,
            label: event.candidate.sdpMLineIndex,
            candidate: event.candidate.candidate,
            targetId: event.originId,
            originId: socket.id
        })
    }
}
