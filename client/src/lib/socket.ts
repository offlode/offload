import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(userId: number, role: string): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
      path: "/ws",
      auth: { userId, role },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      console.log("[Socket.io] Connected:", socket?.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket.io] Disconnected:", reason);
    });

    socket.on("connect_error", (err) => {
      console.warn("[Socket.io] Connection error:", err.message);
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinOrderRoom(orderId: number) {
  if (socket) {
    socket.emit("join_order", orderId);
  }
}

export function leaveOrderRoom(orderId: number) {
  if (socket) {
    socket.emit("leave_order", orderId);
  }
}

export function emitTyping(orderId: number) {
  if (socket) {
    socket.emit("typing", { orderId });
  }
}

export function emitMarkRead(messageId: number) {
  if (socket) {
    socket.emit("mark_read", { messageId });
  }
}
