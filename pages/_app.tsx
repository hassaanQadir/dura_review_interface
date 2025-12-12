import '../styles/globals.css';
import '@recogito/annotorious-openseadragon/dist/annotorious.min.css';
import type { AppProps } from 'next/app';
import AppShell from '../components/AppShell';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AppShell>
      <Component {...pageProps} />
    </AppShell>
  );
}

