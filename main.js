import "webrtc-adapter"
import "./style.css"
import { io } from "socket.io-client";
let myHostname = "localhost";

let connectButton = null;
let disconnectButton = null;
let sendButton = null;
let messageInputBox = null;
let receiveBox = null;

let connection = null;
let localConnection = null;

let sendChannel = null;
let receiveChannel = null;
let clientID = Date.now();
let localname = "";
let otherClientID = null;
let otherClientIDCopy = null;
let otherUsername = null;

function sendToServer(msg) {
  console.log("----Sending '", localname, clientID, otherUsername, otherClientID, otherClientIDCopy);
  console.log("----Sending '" + msg.type + "' message: " + JSON.stringify(msg));
  connection.send(msg);
}

//连接socket服务器
function connectPeers() {
  // 打开一个 web socket
  connection = io('http://127.0.0.1:3333/', {
    transports: ["websocket"]
  });
  connection.on("connect", () => {
    clientID = connection.id; // x8WIv7-mJelg7on_ALbx
    sendToServer({
      type: "username",
      clientID: clientID,
      username: localname
    });
  });
  connection.on("message", (msg) => {
    switch (msg.type) {
      case "userlist":
        creatUserlistMsg(msg);
        break;
      case "data-offer":  // Invitation and offer to chat
        console.log("-----------------data-offer");
        handleDataOfferMsg(msg);
        break;

      case "data-answer":  // Callee has answered our offer
        console.log("-----------------data-answer");
        handleDataAnswerMsg(msg);
        break;

      case "new-ice-candidate": // A new ICE candidate has been received
        console.log("-------------new-ice-candidate");
        handleNewICECandidateMsg(msg);
        break;
      case "leave": // A new ICE candidate has been received
        console.log(`-------------${msg.client.username} leave: ${msg.client.id}`);
        handleLeaveMsg(msg);
        break;
    }
  });
  connection.on("connect_error", (error) => {
    disconnectPeers()
    alert('Im 初始化失败')
  });
  connection.on("disconnect", (error) => {
    console.log('error: ', error);
    disconnectPeers()
  });
}

//创建RTCPeerConnection
function createPeerConnection() {
  console.log("Setting up a connection...");
  localConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: "turn:" + myHostname,  // 一个TURN服务器
        username: "webrtc",
        credential: "turnserver"
      }
    ]
  });
  localConnection.onicecandidate = handleICECandidateEvent;
  localConnection.onnegotiationneeded = handleNegotiationNeededEvent;

  sendChannel = localConnection.createDataChannel("sendChannel");
  sendChannel.onopen = event => {
    console.log("--------send---onopen")
    messageInputBox.disabled = false;
    messageInputBox.focus();
    sendButton.disabled = false;
    disconnectButton.disabled = false;
    connectButton.disabled = true;
  };
  sendChannel.onclose = event => {
    console.log("--------send---onclose")
    disconnectPeers();
  };
  sendChannel.onerror = err => console.log(err);

  localConnection.ondatachannel = event => {
    receiveChannel = event.channel;
    receiveChannel.onmessage = event => {
      var el = document.createElement("p");
      var txtNode = document.createTextNode(event.data);
      el.appendChild(txtNode);
      receiveBox.appendChild(el);
    };
    receiveChannel.onopen = event => console.log("*** receive：", receiveChannel.readyState);
    receiveChannel.onclose = event => {
      console.log("*** receive：", receiveChannel.readyState);
      disconnectPeers();
    };
    receiveChannel.onerror = err => console.log(err);
  };
}


function handleICECandidateEvent(event) {
  if (event.candidate) {
    console.log("*** Outgoing ICE candidate: " + event.candidate.candidate);
    sendToServer({
      type: "new-ice-candidate",
      offerId: clientID,
      anserId: otherClientID,
      candidate: event.candidate
    });
  }
}
function handleLeaveMsg(msg) {
  console.log('msg: ', msg);
  var listElem = document.querySelector(".left-item");
  var child = document.querySelector(`#${msg.client.id}`)
  listElem.removeChild(child)

}
function creatUserlistMsg(msg) {
  var listElem = document.querySelector(".left-item");

  //删除已有的列表
  while (listElem.firstChild) {
    listElem.removeChild(listElem.firstChild);
  }

  // 添加所有用户
  msg.users.forEach(function (node) {
    var item = document.createElement("li");
    item.setAttribute("clientID", node.clientID);
    item.id = node.clientID;
    item.appendChild(document.createTextNode(node.username));
    item.addEventListener("click", invite, false);
    listElem.appendChild(item);
  });
}

function invite(event) {
  otherUsername = event.target.textContent;
  otherClientID = event.target.getAttribute("clientID");
  if (!connectButton.disabled) {
    alert("未连接服务器");
  } else if (localConnection) {
    alert("你暂时不能连接，因为你已经有一个连接了!");
  } else if (otherClientID == clientID) {
    alert("不能向自己发消息");
  }
  else {
    createPeerConnection();
  }
}

//呼叫初始化
async function handleNegotiationNeededEvent() {
  console.log("*** Negotiation");
  if (!otherClientID && (otherClientIDCopy == otherClientID)) {
    return;
  }
  try {
    otherClientIDCopy = otherClientID;
    console.log("---> 创建 offer");
    const offer = await localConnection.createOffer();

    console.log("---> 改变与连接相关的本地描述");
    await localConnection.setLocalDescription(offer);

    console.log("---> 发送这个本地描述到到远端用户");
    console.log(clientID, otherClientID);
    sendToServer({
      type: "data-offer",
      offerId: clientID,
      anserId: otherClientID,
      sdp: localConnection.localDescription
    });
  } catch (err) {
    console.error(err);
  };
}

//呼叫回答
async function handleDataOfferMsg(msg) {
  console.log("Received data chat offer from " + msg.username);
  if (!localConnection) {
    createPeerConnection();
  }

  var desc = new RTCSessionDescription(msg.sdp);

  console.log("  - Setting remote description");
  await localConnection.setRemoteDescription(desc);
  console.log("---> Creating and sending answer to caller");

  await localConnection.setLocalDescription(await localConnection.createAnswer());

  sendToServer({
    type: "data-answer",
    offerId: msg.anserId,
    anserId: msg.offerId,
    sdp: localConnection.localDescription
  });
}

// 通信接收者已经接听了我们的通信
async function handleDataAnswerMsg(msg) {
  console.log("*** 通信接收者已经接听了我们的通信");
  try {
    var desc = new RTCSessionDescription(msg.sdp);
    await localConnection.setRemoteDescription(desc).catch(function (err) { console.log(err); });
  } catch (err) {
    console.error(err);
  }
}

//接受者的 ICE 候选地址信息
async function handleNewICECandidateMsg(msg) {
  var candidate = new RTCIceCandidate(msg.candidate);
  console.log("*** 添加接受者的 ICE 候选地址信息： " + JSON.stringify(candidate));
  try {
    await localConnection.addIceCandidate(candidate)
  } catch (err) {
    console.error(err);
  }
}

function sendMessage() {
  console.log(clientID, localname);
  var message = messageInputBox.value;
  sendChannel.send(message);

  messageInputBox.value = "";
  messageInputBox.focus();
}

//关闭连接
function disconnectPeers() {
  if (sendChannel) {
    sendChannel.onopen = null;
    sendChannel.onclose = null;
    sendChannel.close();
    sendChannel = null;
  }
  if (receiveChannel) {
    receiveChannel.onmessage = null;
    receiveChannel.onopen = null;
    receiveChannel.onclose = null;
    receiveChannel.close();
    receiveChannel = null;
  }
  if (localConnection) {
    localConnection.onicecandidate = null;
    localConnection.onnegotiationneeded = null;
    localConnection.ondatachannel = null;
    localConnection.close();
    localConnection = null;
  }
  if (connection) {
    connection.close();
    connection = null;
  }

  connectButton.disabled = false;
  disconnectButton.disabled = true;
  sendButton.disabled = true;

  messageInputBox.value = "";
  messageInputBox.disabled = true;
}


window.addEventListener('load', function () {
  connectButton = document.getElementById('connectButton');
  disconnectButton = document.getElementById('disconnectButton');
  sendButton = document.getElementById('sendButton');
  messageInputBox = document.getElementById('message');
  receiveBox = document.getElementById('receiveBox');

  connectButton.addEventListener('click', confirmUsername, false);
  disconnectButton.addEventListener('click', disconnectPeers, false);
  sendButton.addEventListener('click', sendMessage, false);
}, false);

window.addEventListener('unload', function () {
  disconnectPeers();
}, false);

//创建当前账户
function confirmUsername() {
  var _username = document.getElementById('username').value;
  if (!_username) {
    alert("用户名不能为空！");
    return
  }
  localname = _username;
  connectButton.disabled = true;
  disconnectButton.disabled = false;
  connectPeers();
}