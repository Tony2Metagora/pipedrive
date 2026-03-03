import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Metagora – Prospection",
  description: "Outil de prospection commerciale Metagora",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${inter.className} antialiased bg-gray-50 text-gray-900`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
