/* eslint-disable react-refresh/only-export-components -- Next.js metadata exports live beside the layout component. */
import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Manrope } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

const sans = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://pointerdb.vercel.app'),
  title: 'Pointer — Seu banco no ritmo do seu teclado',
  description:
    'Um workspace enxuto para desenvolvedores consultarem PostgreSQL, ClickHouse e SQLite sem quebrar o fluxo.',
  openGraph: {
    title: 'Pointer — Seu banco no ritmo do seu teclado',
    description:
      'SQL, tabelas e atalhos em um workspace rápido para PostgreSQL, ClickHouse e SQLite.',
    type: 'website',
    locale: 'pt_BR',
    url: '/',
    siteName: 'Pointer',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pointer — Seu banco no ritmo do seu teclado',
    description:
      'SQL, tabelas e atalhos em um workspace rápido para PostgreSQL, ClickHouse e SQLite.',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#080908',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
