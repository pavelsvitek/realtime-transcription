import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Amie — your meetings, transcribed on your Mac",
  description:
    "Amie writes every word as it’s said, from your mic and your calls. Local by default.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-raycast-canvas font-sans text-raycast-ink">
        {children}
      </body>
    </html>
  );
}
