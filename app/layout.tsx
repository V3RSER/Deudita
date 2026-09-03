import type {Metadata} from 'next';
import { DM_Sans, Outfit } from 'next/font/google';
import './globals.css'; // Global styles
import { ExpenseProvider } from '@/lib/expense-context';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Deudita - Gastos Compartidos y División de Cuentas',
  description: 'Aplicación web de gastos compartidos multiusuario para administrar grupos, dividir gastos desglosados, calcular balances consolidados y gestionar borradores de gastos.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es" className={`${dmSans.variable} ${outfit.variable}`}>
      <body className="font-sans antialiased text-zinc-900 bg-white" suppressHydrationWarning>
        <ExpenseProvider>
          {children}
        </ExpenseProvider>
      </body>
    </html>
  );
}
