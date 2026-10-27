"use client";

import { LogOutIcon, UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";
import type { NavItem } from "./nav-items";
import { MobileNav } from "./sidebar";

type Props = { items: NavItem[]; orgName: string; user: { name: string; email: string } };

/** Sticky app bar: phone menu, org name, theme, and the account menu with sign out. */
export function TopBar({ items, orgName, user }: Props) {
  const t = useTranslations("shell");
  const router = useRouter();

  async function onSignOut() {
    await signOut();
    router.replace("/login");
    router.refresh(); // drop the signed-in RSC cache
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background px-4 sm:px-6">
      <MobileNav items={items} />
      <p className="min-w-0 flex-1 truncate font-medium">{orgName}</p>
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("account")}>
            <UserIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="flex flex-col">
            <span className="truncate">{user.name}</span>
            <span className="truncate font-normal text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onSignOut}>
            <LogOutIcon className="rtl:rotate-180" />
            {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
