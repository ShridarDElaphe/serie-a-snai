import type { Metadata } from "next";
import { Newsreader, Outfit } from "next/font/google";
import { Header } from "@/components/Header";
import "./globals.css";

const display = Newsreader({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"] });
const sans = Outfit({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Margine — Serie A",
  description: "Proposte prudenti sulla Serie A per chi gioca su SNAI. Nessuna vincita è garantita.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body className={`${display.variable} ${sans.variable}`}>
        <Header />
        {children}
        <footer className="site-footer">
          <p>
            <strong>Nessuna proposta è una vincita sicura.</strong> «Sicura» significa solo che i segnali del modello concordano.
            Le quote SNAI non sono lette qui: una giocata più prudente è, di solito, una quota più bassa. Decidi tu.
            Il gioco è vietato ai minori e può creare dipendenza.
          </p>
        </footer>
      </body>
    </html>
  );
}
