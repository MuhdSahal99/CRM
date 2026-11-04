import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";

/** Small muted "‹ Parent" link above a page header. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 self-start rounded-full text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
      <ChevronLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
      {children}
    </Link>
  );
}
