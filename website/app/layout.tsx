/* eslint-disable react-refresh/only-export-components -- Next.js metadata exports live beside the layout component. */
import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Manrope } from 'next/font/google'
import { cookies, headers } from 'next/headers'
import type { ReactNode } from 'react'
import './globals.css'
import { getTranslation, resolveLocale } from './i18n'

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

export async function generateMetadata(): Promise<Metadata> {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()])
  const locale = resolveLocale(cookieStore.get('pointer.locale')?.value, headerStore.get('accept-language'))
  const copy = getTranslation(locale)

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://pointerdb.vercel.app'),
    title: copy.metadata.title,
    description: copy.metadata.description,
    openGraph: {
      title: copy.metadata.title,
      description: copy.metadata.socialDescription,
      type: 'website',
      locale: copy.htmlLang.replace('-', '_'),
      url: '/',
      siteName: 'Pointer',
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.metadata.title,
      description: copy.metadata.socialDescription,
    },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#080908',
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()])
  const locale = resolveLocale(cookieStore.get('pointer.locale')?.value, headerStore.get('accept-language'))

  return (
    <html lang={getTranslation(locale).htmlLang} className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
