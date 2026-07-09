import type { Metadata } from 'next'
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'

/**
 * next/font injects CSS custom properties on the html element.
 * The variable names here must match what @theme in globals.css expects:
 *   --font-space-grotesk  (display text)
 *   --font-jetbrains-mono (code / mono)
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'root@mayank',
  description:
    'DevSecOps engineer — interactive WebGL portfolio. Explore a live system, run commands, and watch it react.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      {/*
        suppressHydrationWarning on <body> because useAccentSync writes inline
        styles to <html> on the client, which can cause a mismatch warning.
      */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
