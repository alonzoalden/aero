'use client';

import { useEffect, useRef, useState } from 'react';
import { upsertFlight } from '@/lib/flightState';
import type { FlightAlert, FlightState, FlightStreamMessage } from '@/types/flight';

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

const socketUrl = process.env.NEXT_PUBLIC_FLIGHT_WS_URL ?? 'ws://localhost:8787';

export function useFlightStream() {
  const [flightsById, setFlightsById] = useState<Record<string, FlightState>>({});
  const [alerts, setAlerts] = useState<FlightAlert[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const pendingMessages = useRef<FlightStreamMessage[]>([]);
  const frameId = useRef<number | null>(null);

  useEffect(() => {
    const socket = new WebSocket(socketUrl);

    function flushMessages() {
      frameId.current = null;
      const batch = pendingMessages.current.splice(0);

      setFlightsById((current) => {
        let next = current;
        for (const message of batch) {
          const updates = message.type === 'snapshot' ? message.flights : [message.flight];
          for (const update of updates) {
            next = upsertFlight(next, update);
          }
        }
        return next;
      });

      const latestAlerts = batch.at(-1)?.alerts;
      if (latestAlerts) {
        setAlerts(latestAlerts);
      }
    }

    socket.addEventListener('open', () => setConnectionStatus('open'));
    socket.addEventListener('close', () => setConnectionStatus('closed'));
    socket.addEventListener('error', () => setConnectionStatus('error'));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data) as FlightStreamMessage;
      pendingMessages.current.push(message);

      // Batch socket bursts into a paint frame; deck.gl owns the high-frequency drawing work.
      frameId.current ??= window.requestAnimationFrame(flushMessages);
    });

    return () => {
      socket.close();
      if (frameId.current) {
        window.cancelAnimationFrame(frameId.current);
      }
    };
  }, []);

  return { alerts, connectionStatus, flightsById };
}
