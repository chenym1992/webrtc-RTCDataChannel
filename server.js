import { Server } from "socket.io";
const io = new Server(3333, {
    cors: {
        origin: "*"
    }
});
const connectionArr = []
io.on("connection", (socket) => {
    connectionArr.push(socket)
    socket.on("message", (msg) => {
        switch (msg.type) {
            case "username": //新用户
                socket.username = msg.username;
                sendToAllListUser();
                break;
            default: //其他所有信息只往单个用户发送
                let con = connectionArr.find(f => f.id == msg.anserId);
                if (con) {
                    con.send(msg);
                }
                break;
        }
    })
    socket.on("disconnect", () => {
        const idx = connectionArr.findIndex(v => v.id === socket.id)
        connectionArr.splice(idx, 1)
        sendToAllListUserOffline(socket)
    });
});

function sendToAllListUser() {
    const userlist = connectionArr.map(m => {
        return { clientID: m.id, username: m.username };
    });
    connectionArr.forEach(con => {
        con.send({
            type: "userlist",
            users: userlist
        });
    });
}

function sendToAllListUserOffline({ id, username }) {
    connectionArr.forEach(con => {
        con.send({
            type: "leave",
            client: {
                id, username
            }
        });
    });
}
