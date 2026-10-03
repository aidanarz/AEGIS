import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppNav } from "@/components/app-nav";
import { RoleHint, RoleProvider } from "@/components/role-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Intelligence Manufacturing Platform",
  description: "CALIBER 2026 Case 2 — unified data foundation, single pane of glass, AI root cause & action.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <RoleProvider>
          <TooltipProvider>
            <AppNav />
            <RoleHint />
            <main className="mx-auto max-w-[1400px] px-6 py-6">{children}</main>
          </TooltipProvider>
        </RoleProvider>
      </body>
    </html>
  );
}
