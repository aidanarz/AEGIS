import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppNav } from "@/components/app-nav";
import { RoleProvider } from "@/components/role-provider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AEGIS — Intelligence Manufacturing",
  description: "Manufacturing intelligence platform — unified data, AI root cause & action.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-[#F4F6F8] antialiased">
        <RoleProvider>
          <TooltipProvider>
            <div className="flex min-h-screen">
              <AppNav />
              <main className="flex-1 min-w-0 overflow-auto">
                <div className="mx-auto max-w-[1400px] px-6 py-6 md:px-8 md:py-8">
                  {children}
                </div>
              </main>
            </div>
          </TooltipProvider>
        </RoleProvider>
      </body>
    </html>
  );
}
