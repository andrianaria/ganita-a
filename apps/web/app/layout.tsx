import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "GANITA.ai",
  description: "GANITA.ai - count right. grow bright"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const content = (
    <html lang="id">
      <body>{children}</body>
    </html>
  );

  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return content;
  }

  return <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>{content}</ClerkProvider>;
}
