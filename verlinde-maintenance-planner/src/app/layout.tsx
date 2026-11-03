import type { Metadata } from "next";
import { connection } from "next/server";
import { loadAppData } from "@/lib/data/normalize";
import { AppProvider } from "@/components/app-provider";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
export const metadata: Metadata = { title: "Verlinde Maintenance Planner", description: "Onderhoud opvolgen en werkorders eenvoudig inplannen op basis van de lokale BuildDesk-export." };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const data = await loadAppData();
  return <html lang="nl"><body><AppProvider data={data}><AppShell>{children}</AppShell></AppProvider></body></html>;
}
