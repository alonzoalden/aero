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
      status: getStatus()
    };
    socket.send(JSON.stringify(message));
  });

  function broadcast(message: FlightStreamMessage) {
    const encoded = JSON.stringify(message);
    for (const client of webSocketServer.clients) {
      if (client.readyState === client.OPEN) {
        client.send(encoded);
      }
    }
  }

  return {
    broadcast,
    get clientCount() {
      return webSocketServer.clients.size;
    }
  };
}
