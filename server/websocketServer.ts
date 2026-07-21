import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import type { FlightAlert, FlightPositionUpdate, FlightServerStatus, FlightStreamMessage } from '../src/types/flight';

type WebSocketFlightServerOptions = {
  server: Server;
  getStatus: () => FlightServerStatus;
  getSnapshot: () => FlightPositionUpdate[];
  getAlerts: () => FlightAlert[];
};

export function createWebSocketFlightServer({
  server,
  getStatus,
  getSnapshot,
  getAlerts
}: WebSocketFlightServerOptions) {
  const webSocketServer = new WebSocketServer({ server });

  webSocketServer.on('connection', (socket) => {
    const message: FlightStreamMessage = {
      type: 'snapshot',
      flights: getSnapshot(),
      alerts: getAlerts(),
      status: getStatus(),
      serverTimestamp: new Date().toISOString()
    };
    socket.send(JSON.stringify(message));
  });

  function broadcast(message: FlightStreamMessage) {
    const encoded = JSON.stringify(message);
    let sentCount = 0;
    for (const client of webSocketServer.clients) {
      if (client.readyState === client.OPEN) {
        client.send(encoded);
        sentCount += 1;
      }
    }
    return sentCount;
  }

  return {
    broadcast,
    get clientCount() {
      return webSocketServer.clients.size;
    }
  };
}
