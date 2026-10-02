import { Suspense } from "react";
import { Nut } from "lucide-react";
import { SignInForm } from "./signin-form";

export default function SignInPage() {
  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <Nut className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Peanut Billing</div>
              <div className="text-xs text-muted-foreground">Sign in to continue</div>
            </div>
          </div>
          <Suspense fallback={null}>
            <SignInForm />
          </Suspense>
        </div>
      </div>
      <div className="hidden lg:flex items-center justify-center bg-muted/40 p-10">
        <div className="max-w-md space-y-4">
          <h1 className="text-3xl font-bold tracking-tight">
            Billing, stock, ledger &amp; expenses in one place.
          </h1>
          <p className="text-sm text-muted-foreground">
            Built for peanut traders. Owner-only cost &amp; profit stay owner-only. Multi-device
            safe. Printable bills and daily ledgers. Nothing fancier than you need.
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 pt-2">
            <li>· Auto bill numbering per financial year (1 Apr – 31 Mar)</li>
            <li>· Weight shorthand like <code className="font-mono">50x40.5</code></li>
            <li>· Stock derived from entries — safe when multiple devices bill at once</li>
            <li>· CSV / JSON backup downloads</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
