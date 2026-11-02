import "./globals.css";
import { IBM_Plex_Sans_Arabic, Urbanist } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// Self-hosted at build time by next/font: no runtime request to Google.
const latin = Urbanist({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-latin" });
// Arabic glyphs fall through to this face via unicode-range; not preloaded while the UI is English-only.
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  preload: false,
});

const RTL_LOCALES = new Set(["ar"]);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      dir={RTL_LOCALES.has(locale) ? "rtl" : "ltr"}
      className={`${latin.variable} ${arabic.variable}`}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider>
          <ThemeProvider
            attribute="data-theme"
            defaultTheme="dark"
            enableSystem
            storageKey="app:theme"
            themes={["light", "dark"]}
          >
            <div aria-hidden className="app-backdrop" />
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
