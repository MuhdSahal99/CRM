"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInEmail, type SignInResult } from "@/lib/auth-client";

type Failure = Extract<SignInResult, { ok: false }>["reason"];

export function LoginForm() {
  const t = useTranslations("login");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [remember, setRemember] = useState(true);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const r = await signInEmail({ email: String(form.get("email")), password: String(form.get("password")), rememberMe: remember });
    if (r.ok) {
      router.push("/app");
      router.refresh();
      return;
    }
    setError(r.reason);
    setPending(false);
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-5" aria-busy={pending}>
      {error && (
        <p id="login-error" role="alert" className="flex items-start gap-2 rounded-md bg-muted p-3 text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t(`errors.${error}`)}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          aria-invalid={error === "invalid" || undefined}
          aria-describedby={error ? "login-error" : undefined}
          className="h-11"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={error === "invalid" || undefined}
          aria-describedby={error ? "login-error" : undefined}
          className="h-11"
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
        <Label htmlFor="remember" className="font-normal">{t("remember")}</Label>
      </div>
      <Button type="submit" size="lg" disabled={pending} className="h-11">
        {pending && <Loader2Icon className="animate-spin" aria-hidden />}
        {pending ? t("submitting") : t("submit")}
      </Button>
      <p className="text-muted-foreground">{t("forgot")}</p>
    </form>
  );
}
