import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = {
  title: "Antigravity — CI/CD Reliability Intelligence",
  description:
    "Scan CI/CD pipelines for security vulnerabilities, grade pipeline health, and generate AI-powered fixes instantly.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen font-sans antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
