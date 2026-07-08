import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Flight Ops Live Map',
  description: 'A thin real-time aviation geospatial UI slice with React, MapLibre, deck.gl, D3, and WebSockets.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
