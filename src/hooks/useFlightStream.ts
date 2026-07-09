'use client';

import { useEffect, useRef, useState } from 'react';
import { replaceFlights, upsertFlights } from '@/lib/flightState';
import type {
  FlightAlert,
  FlightPositionUpdate,
  FlightServerStatus,
  FlightState,
  FlightStreamMessage
} from '@/types/flight';

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

export type FrontendStreamMetrics = {
  receivedMessagesPerSec: number;
  aircraftUpdatesReceivedPerSec: number;
  renderFps: number;
  lastSequence: number | null;
  lastServerTimestamp: string | null;
};

const socketUrl = process.env.NEXT_PUBLIC_FLIGHT_WS_URL ?? 'ws://localhost:8787';

export function useFlightStream() {
  const [flightsById, setFlightsById] = useState<Record<string, FlightState>>({});
  const [alerts, setAlerts] = useState<FlightAlert[]>([]);
  const [serverStatus, setServerStatus] = useState<FlightServerStatus | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [frontendMetrics, setFrontendMetrics] = useState<FrontendStreamMetrics>({
    receivedMessagesPerSec: 0,
    aircraftUpdatesReceivedPerSec: 0,
    renderFps: 0,
    lastSequence: null,
    lastServerTimestamp: null
  });
  const pendingMessages = useRef<FlightStreamMessage[]>([]);
  const frameId = useRef<number | null>(null);
  const receivedMessagesThisSecond = useRef(0);
  const aircraftUpdatesThisSecond = useRef(0);
  const framesThisSecond = useRef(0);
  const latestSequence = useRef<number | null>(null);
  const latestServerTimestamp = useRef<string | null>(null);

  useEffect(() => {
    const socket = new WebSocket(socketUrl);
    let fpsFrameId: number | null = null;

    function flushMessages() {
      frameId.current = null;
      const batch = pendingMessages.current.splice(0);
      let lastSnapshotIndex = -1;
      for (let index = batch.length - 1; index >= 0; index -= 1) {
        if (batch[index].type === 'snapshot') {
          lastSnapshotIndex = index;
          break;
        }
      }
      const messagesToApply = lastSnapshotIndex >= 0 ? batch.slice(lastSnapshotIndex) : batch;
      const latestUpdates = new Map<string, FlightPositionUpdate>();

      for (const message of messagesToApply) {
        const updates = message.type === 'position' ? [message.flight] : message.flights;
        for (const update of updates) {
          latestUpdates.set(update.flightId, update);
        }
      }

      setFlightsById((current) => {
        const updates = Array.from(latestUpdates.values());
        return lastSnapshotIndex >= 0 ? replaceFlights(updates) : upsertFlights(current, updates);
      });

      const latestAlerts = batch.at(-1)?.alerts;
      if (latestAlerts) {
        setAlerts(latestAlerts);
      }

      const latestStatus = batch.at(-1)?.status;
      if (latestStatus) {
        setServerStatus(latestStatus);
      }
    }

    function measureFrame() {
      framesThisSecond.current += 1;
      fpsFrameId = window.requestAnimationFrame(measureFrame);
    }

    socket.addEventListener('open', () => setConnectionStatus('open'));
    socket.addEventListener('close', () => setConnectionStatus('closed'));
    socket.addEventListener('error', () => setConnectionStatus('error'));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data) as FlightStreamMessage;
      pendingMessages.current.push(message);
      receivedMessagesThisSecond.current += 1;
      aircraftUpdatesThisSecond.current += message.type === 'position' ? 1 : message.flights.length;
      latestSequence.current = message.sequence ?? latestSequence.current;
      latestServerTimestamp.current = message.serverTimestamp ?? latestServerTimestamp.current;

      // Batch socket bursts into a paint frame; deck.gl owns the high-frequency drawing work.
      frameId.current ??= window.requestAnimationFrame(flushMessages);
    });

    fpsFrameId = window.requestAnimationFrame(measureFrame);
    const metricsIntervalId = window.setInterval(() => {
      setFrontendMetrics({
        receivedMessagesPerSec: receivedMessagesThisSecond.current,
        aircraftUpdatesReceivedPerSec: aircraftUpdatesThisSecond.current,
        renderFps: framesThisSecond.current,
        lastSequence: latestSequence.current,
        lastServerTimestamp: latestServerTimestamp.current
      });
      receivedMessagesThisSecond.current = 0;
      aircraftUpdatesThisSecond.current = 0;
      framesThisSecond.current = 0;
    }, 1000);

    return () => {
      socket.close();
      if (frameId.current) {
        window.cancelAnimationFrame(frameId.current);
      }
      if (fpsFrameId) {
        window.cancelAnimationFrame(fpsFrameId);
      }
      window.clearInterval(metricsIntervalId);
    };
  }, []);

  return { alerts, connectionStatus, flightsById, frontendMetrics, serverStatus };
}
