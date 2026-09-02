import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
      <p className="font-data text-xs tracking-[0.18em] text-primary">404</p>
      <h1 className="font-display text-5xl tracking-[-0.04em]">
        Experiment not found
      </h1>
      <p className="max-w-md leading-7 text-muted-foreground">
        This route is outside the current research tree. /
        此页面不在当前研究路径中。
      </p>
      <Link href="/" className={buttonVariants()}>
        Return to PokerLab / 返回首页
      </Link>
    </section>
  );
}
