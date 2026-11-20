
import "./globals.css";
import { ChatProvider } from "../context/ChatContext";
import type { ReactNode } from "react";

export const metadata = {
  title: "Mortgage AI | Post-Closing Audit Assistant",
  description: "AI-powered Mortgage Post-Closing Audit Assistant",
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <ChatProvider>
          {children}
        </ChatProvider>
      </body>
    </html>
  );
}
