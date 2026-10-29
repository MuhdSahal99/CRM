"use client";

import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ModuleSetup = { name: string; defaults: Record<string, string>; fields: { api_name: string; label_key: string }[] };
type Job = { id: string; status: string; total_rows: number; valid_rows: number; error_rows: number; duplicate_rows: number; flagged_rows: number; imported_rows: number; failure_message: string | null; row_errors?: { row_no: number; column: string; message: string }[] };

const SKIP = "__skip__";
const ZOHO_ID = "zoho_id";

/** The first record of a CSV: the column headings, read in the browser so the mapping can be offered before anything is uploaded. */
function headingsOf(text: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (const ch of text.replace(/^﻿/, "")) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { out.push(cell.trim()); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) break;
    else cell += ch;
  }
  out.push(cell.trim());
  return out.filter(Boolean);
}

/** T11.09 (US-17): file → column mapping → dry-run report → confirm → result and the failed rows. The server checks everything again. */
export function ImportWizard({ modules }: { modules: ModuleSetup[] }) {
  const t = useTranslations("import");
  const tAll = useTranslations();
  const [moduleName, setModuleName] = useState(modules[0]!.name);
  const [file, setFile] = useState<File | null>(null);
  const [headings, setHeadings] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setup = modules.find((m) => m.name === moduleName)!;

  const suggest = (heads: string[], m: ModuleSetup) => setMapping(Object.fromEntries(heads.map((h) => [h, m.defaults[h] ?? SKIP])));
  async function choose(next: File | null, nextModule = moduleName) {
    setFile(next);
    setJob(null);
    setError(null);
    if (!next) return setHeadings([]);
    const heads = headingsOf(await next.slice(0, 65_536).text());
    setHeadings(heads);
    suggest(heads, modules.find((m) => m.name === nextModule)!);
  }

  async function poll(id: string, until: string[]) {
    const res = await fetch(`/api/v1/imports/${id}`);
    const next: Job = (await res.json()).data[0];
    setJob(next);
    if (until.includes(next.status)) return setBusy(false);
    timer.current = setTimeout(() => void poll(id, until), 1500);
  }

  async function check() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("module", moduleName);
    form.set("file", file);
    form.set("mapping", JSON.stringify(Object.fromEntries(Object.entries(mapping).filter(([, target]) => target !== SKIP))));
    const res = await fetch("/api/v1/imports", { method: "POST", body: form });
    const body = await res.json().catch(() => null);
    if (res.status !== 202) {
      setBusy(false);
      return setError(res.status === 413 ? t("tooLarge") : (body?.message ?? t("failed")));
    }
    void poll(body.data[0].id, ["validated", "failed", "done"]);
  }

  async function confirm() {
    if (!job) return;
    setBusy(true);
    const res = await fetch(`/api/v1/imports/${job.id}/actions/confirm`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: "{}" });
    if (res.status !== 202) {
      setBusy(false);
      return setError((await res.json().catch(() => null))?.message ?? t("failed"));
    }
    void poll(job.id, ["done", "failed"]);
  }

  const stat = (label: string, value: number) => (
    <div className="flex flex-col rounded-lg border p-3">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <section className="flex flex-col gap-4" aria-label={t("step1")}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-module">{t("module")}</Label>
          <Select value={moduleName} onValueChange={(v) => { setModuleName(v); if (file) void choose(file, v); }}>
            <SelectTrigger id="import-module" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modules.map((m) => (
                <SelectItem key={m.name} value={m.name}>
                  {tAll(`modules.${m.name}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-file">{t("file")}</Label>
          <Input id="import-file" type="file" accept=".csv,text/csv" onChange={(e) => void choose(e.target.files?.[0] ?? null)} />
        </div>
      </section>

      {headings.length > 0 && !job && (
        <section className="flex flex-col gap-3" aria-label={t("step2")}>
          <h2 className="text-lg font-medium">{t("mapTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("mapHint")}</p>
          <ul className="flex flex-col divide-y rounded-lg border">
            {headings.map((h) => (
              <li key={h} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 font-medium break-words">{h}</span>
                <Select value={mapping[h] ?? SKIP} onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v }))}>
                  <SelectTrigger className="w-full sm:w-64" aria-label={t("mapTo", { column: h })}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SKIP}>{t("skip")}</SelectItem>
                    <SelectItem value={ZOHO_ID}>{t("zohoId")}</SelectItem>
                    {setup.fields.map((f) => (
                      <SelectItem key={f.api_name} value={f.api_name}>
                        {tAll(f.label_key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
          <Button type="button" className="self-start" onClick={check} disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" aria-hidden />}
            {t("check")}
          </Button>
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-muted p-3 text-destructive">
          {error}
        </p>
      )}

      {job && (
        <section className="flex flex-col gap-4" aria-label={t("step3")} aria-live="polite">
          <h2 className="flex items-center gap-2 text-lg font-medium">
            {job.status === "done" ? t("doneTitle") : job.status === "failed" ? t("failedTitle") : job.status === "validated" ? t("reportTitle") : t("working")}
            <Badge variant={job.status === "failed" ? "destructive" : "secondary"}>{t(`status.${job.status}`)}</Badge>
          </h2>
          {job.failure_message && <p role="alert" className="text-destructive">{job.failure_message}</p>}
          {job.status !== "uploaded" && job.status !== "validating" && !job.failure_message && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {stat(t("rows"), job.total_rows)}
              {stat(job.status === "done" ? t("imported") : t("ready"), job.status === "done" ? job.imported_rows : job.valid_rows)}
              {stat(t("duplicates"), job.duplicate_rows)}
              {stat(t("flagged"), job.flagged_rows)}
              {stat(t("errors"), job.error_rows)}
            </div>
          )}
          {job.status === "validated" && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{t("dryRunNote")}</p>
              <Button type="button" className="self-start" onClick={confirm} disabled={busy || job.valid_rows + job.duplicate_rows + job.flagged_rows === 0}>
                {busy && <Loader2Icon className="animate-spin" aria-hidden />}
                {t("confirm", { count: job.valid_rows + job.duplicate_rows + job.flagged_rows })}
              </Button>
            </div>
          )}
          {(job.row_errors?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="font-medium">{t("rowErrors")}</h3>
              <ul className="flex flex-col divide-y rounded-lg border text-sm">
                {job.row_errors!.slice(0, 20).map((e, i) => (
                  <li key={i} className="p-2 break-words">
                    {t("rowError", { row: e.row_no, column: e.column, message: e.message })}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {job.error_rows > 0 && job.status !== "uploaded" && job.status !== "validating" && (
            <Button asChild variant="outline" className="self-start">
              <a href={`/api/v1/imports/${job.id}/errors`} download>
                {t("download")}
              </a>
            </Button>
          )}
          {(job.status === "done" || job.status === "failed") && (
            <Button type="button" variant="outline" className="self-start" onClick={() => void choose(null)}>
              {t("another")}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
