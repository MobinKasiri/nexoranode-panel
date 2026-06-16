import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || "Nexoranode Admin",
  description: "پنل مدیریت نکسورانود",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className="dark">
      <body>
        {children}
        <Toaster position="top-left" toastOptions={{ style: { background: "#1a1d27", color: "#f1f5f9", border: "1px solid #2a2d3e" } }} />
      </body>
    </html>
  );
}
