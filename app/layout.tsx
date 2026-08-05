import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Gastos Compartidos - Plataforma Multi-Grupo',
  description: 'Aplicación web de gastos compartidos multiusuario para administrar grupos, dividir gastos desglosados y calcular balances consolidados.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
