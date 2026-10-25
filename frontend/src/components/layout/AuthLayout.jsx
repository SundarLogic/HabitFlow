/**
 * Frame for the login and signup pages: centred card with the logo, a heading and a footer link
 * (e.g. "No account? Sign up"). Has its own <main> landmark and skip target.
 */
import { Card } from '../ui/index.js';
import { Logo } from './Logo.jsx';

export function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <Card>
          <h1 className="text-xl font-semibold text-fg">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </Card>
        {footer && <p className="mt-6 text-center text-sm text-fg-muted">{footer}</p>}
      </div>
    </main>
  );
}
