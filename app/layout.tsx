// app/layout.tsx
import "./globals.css"

export const metadata = {
  title: "A2 Schreibtrainer",
  description: "Local A2 writing trainer",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full min-h-dvh w-full bg-gray-50 text-gray-900">
        {/* No centered container here — children take full width */}
        {children}
      </body>
    </html>
  )
}
