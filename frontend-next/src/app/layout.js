
import "./globals.css";
import { ChatProvider } from "../context/ChatContext";

export const metadata = {
  title: "Mortgage AI | Post-Closing Audit Assistant",
  description: "AI-powered Mortgage Post-Closing Audit Assistant",
};

export default function RootLayout({ children }) {
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
