import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="not-found-page">
      <section>
        <p>404</p>
        <h1>Airspace not found</h1>
        <Link href="/">Return to live map</Link>
      </section>
    </main>
  );
}
