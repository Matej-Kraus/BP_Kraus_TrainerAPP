import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthContext";
import type { UserRole } from "@/api/auth";
import { getErrorMessage } from "@/lib/errors";

export default function LoginPage() {
  const navigate = useNavigate();
  const auth = useAuth();

  const [registerClubName, setRegisterClubName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerRole, setRegisterRole] = useState<UserRole>("coach");
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);
  const [registerSubmitting, setRegisterSubmitting] = useState(false);

  const [loginEmail, setLoginEmail] = useState("coach@demo.local");
  const [loginPassword, setLoginPassword] = useState("coach");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  async function submitRegister() {
    try {
      setRegisterError(null);
      setRegisterSuccess(null);
      setRegisterSubmitting(true);
      await auth.register(
        registerClubName.trim(),
        registerEmail.trim(),
        registerPassword,
        registerRole
      );
      if (registerRole === "coach") {
        navigate("/club?onboarding=1", { replace: true });
      } else {
        navigate("/players", { replace: true });
      }
    } catch (e: unknown) {
      setRegisterError(getErrorMessage(e));
    } finally {
      setRegisterSubmitting(false);
    }
  }

  async function submitLogin() {
    try {
      setLoginError(null);
      setLoginSubmitting(true);
      await auth.login(loginEmail.trim(), loginPassword);
      navigate("/players", { replace: true });
    } catch (e: unknown) {
      setLoginError(getErrorMessage(e));
    } finally {
      setLoginSubmitting(false);
    }
  }

  function applyDemoCredentials(role: "coach" | "assistant") {
    if (role === "coach") {
      setLoginEmail("coach@demo.local");
      setLoginPassword("coach");
      return;
    }
    setLoginEmail("assistant@demo.local");
    setLoginPassword("assistant");
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 flex items-center justify-center">
      <div className="w-full max-w-5xl grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Registrace klubu</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {registerError && (
              <div className="rounded-xl border border-destructive p-3 text-sm text-destructive">
                {registerError}
              </div>
            )}
            {registerSuccess && (
              <div className="rounded-xl border border-emerald-500/60 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                {registerSuccess}
              </div>
            )}

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Název klubu</div>
              <Input
                value={registerClubName}
                onChange={(e) => setRegisterClubName(e.target.value)}
                placeholder="Např. FK Příbram"
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Email</div>
              <Input
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                placeholder="trener@klub.cz"
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Role účtu</div>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={registerRole}
                onChange={(e) => setRegisterRole(e.target.value as UserRole)}
              >
                <option value="coach">Trenér (plná oprávnění)</option>
                <option value="assistant">Asistent (omezená oprávnění)</option>
              </select>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Heslo</div>
              <Input
                type="password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitRegister();
                }}
              />
            </div>

            <Button className="w-full" disabled={registerSubmitting} onClick={() => void submitRegister()}>
              Registrovat
            </Button>
            <div className="text-xs text-muted-foreground">
              Každý účet má jednu roli. Pro druhou roli vytvoř samostatný účet.
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Přihlášení</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-sky-500/50 bg-sky-500/10 p-3 text-sm">
              <div className="font-medium text-sky-800 dark:text-sky-200">
                Demo účty pro vyzkoušení
              </div>
              <div className="mt-1 text-sky-700 dark:text-sky-300">
                Trenér: <code>coach@demo.local</code> / <code>coach</code>
              </div>
              <div className="text-sky-700 dark:text-sky-300">
                Asistent: <code>assistant@demo.local</code> / <code>assistant</code>
              </div>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="secondary" onClick={() => applyDemoCredentials("coach")}>
                  Vyplnit trenér
                </Button>
                <Button type="button" variant="secondary" onClick={() => applyDemoCredentials("assistant")}>
                  Vyplnit asistent
                </Button>
              </div>
            </div>

            {auth.sessionExpired && (
              <div className="rounded-xl border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
                Přihlášení vypršelo. Přihlas se prosím znovu.
              </div>
            )}

            {loginError && (
              <div className="rounded-xl border border-destructive p-3 text-sm text-destructive">
                {loginError}
              </div>
            )}

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Email</div>
              <Input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Heslo</div>
              <Input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitLogin();
                }}
              />
            </div>

            <Button className="w-full" disabled={loginSubmitting} onClick={() => void submitLogin()}>
              Přihlásit
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

