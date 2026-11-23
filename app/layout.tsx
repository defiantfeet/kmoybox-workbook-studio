import type { Metadata } from 'next';
import '@fontsource-variable/dm-sans';
import '@fontsource/instrument-serif';
import '@fontsource/instrument-serif/400-italic.css';
import './studio.css';

export const metadata: Metadata = {
  title: 'KMOYBOX Workbook Studio',
  description: 'A personal space to reflect, set intentions, and grow.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
