import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trio, live coding interviews',
  description: 'AI-first live coding interview platform',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
