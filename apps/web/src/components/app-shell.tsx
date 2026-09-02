"use client";

import {
  Atom,
  BookOpen,
  BrainCircuit,
  ChartNoAxesCombined,
  FlaskConical,
  Gauge,
  Grid3X3,
  History,
  Languages,
  Menu,
  Sigma,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useLabStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", en: "Overview", zh: "总览", icon: Sparkles },
  {
    href: "/equity",
    en: "Equity Lab",
    zh: "胜率实验室",
    icon: ChartNoAxesCombined,
  },
  { href: "/range", en: "Range Lab", zh: "范围实验室", icon: Grid3X3 },
  { href: "/trainer", en: "Guess the Equity", zh: "猜胜率", icon: Gauge },
  { href: "/ev", en: "EV Lab", zh: "EV 实验室", icon: Sigma },
  {
    href: "/solver",
    en: "CFR Solver Lite",
    zh: "CFR 轻量求解器",
    icon: BrainCircuit,
  },
  {
    href: "/research",
    en: "Research / AI",
    zh: "研究 / AI",
    icon: FlaskConical,
  },
  { href: "/experiments", en: "Experiments", zh: "实验历史", icon: History },
  { href: "/about", en: "Methods & limits", zh: "方法与限制", icon: BookOpen },
];

function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="flex size-9 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
        <Atom />
      </span>
      <span>
        <span className="block text-sm font-semibold tracking-[0.18em]">
          POKERLAB
        </span>
        <span className="block text-[10px] tracking-[0.12em] text-muted-foreground">
          P · S · U
        </span>
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const locale = useLabStore((state) => state.locale);
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {navigation.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon aria-hidden="true" />
            <span>{locale === "zh" ? item.zh : item.en}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function LanguageButton() {
  const locale = useLabStore((state) => state.locale);
  const toggleLocale = useLabStore((state) => state.toggleLocale);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleLocale}
      aria-label={locale === "en" ? "切换为中文" : "Switch to English"}
    >
      <Languages data-icon="inline-start" />
      {locale === "en" ? "中文" : "EN"}
    </Button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const locale = useLabStore((state) => state.locale);
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] border-r bg-card/80 p-5 backdrop-blur-xl lg:flex lg:flex-col">
        <Brand />
        <div className="mt-8 flex-1">
          <NavLinks />
        </div>
        <div className="flex items-center justify-between border-t pt-4">
          <span className="font-data text-[10px] text-muted-foreground">
            LOCAL · v1.0
          </span>
          <LanguageButton />
        </div>
      </aside>
      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/85 px-4 backdrop-blur-xl lg:hidden">
          <Brand />
          <div className="flex items-center gap-2">
            <LanguageButton />
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Open navigation"
                  />
                }
              >
                <Menu />
              </SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>POKERLAB</SheetTitle>
                  <SheetDescription>
                    Probability · Strategy · Uncertainty
                  </SheetDescription>
                </SheetHeader>
                <div className="px-3">
                  <NavLinks onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>
        <main className="mx-auto min-h-screen w-full max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
