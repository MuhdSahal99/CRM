import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

/** Home while its data streams in: the header and the card grid, in the same shape as the real thing. */
export function HomeSkeleton() {
  const t = useTranslations("home");
  return (
    <div role="status" aria-busy="true" aria-label={t("loading")} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
        <h1 className="text-[30px] leading-[1.05] font-semibold tracking-[-0.02em] md:text-[34px]">
          <span className="block">{t("title1")}</span>
          <span className="block">{t("title2")}</span>
        </h1>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-(--gap) md:grid-cols-6 xl:grid-cols-12">
        <div className="flex flex-col gap-(--gap) md:col-span-6 xl:col-span-8">
          <Skeleton className="h-96 rounded-card" />
          <Skeleton className="h-96 rounded-card" />
        </div>
        <div className="flex flex-col gap-(--gap) md:col-span-6 xl:col-span-4">
          <Skeleton className="h-[34rem] rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
        <Skeleton className="md:col-span-3 xl:col-span-6 h-64 rounded-card" />
        <Skeleton className="md:col-span-3 xl:col-span-6 h-64 rounded-card" />
      </div>
    </div>
  );
}
