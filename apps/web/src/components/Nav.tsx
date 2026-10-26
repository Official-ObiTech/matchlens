"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useRole, useSession } from "@/lib/client/hooks";
import { useSlip } from "@/lib/client/slipStore";
import { BallIcon, ChartIcon, HomeIcon, LogoMark, SlipIcon, UserIcon } from "./Icons";

const LINKS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/matches", label: "Matches", icon: BallIcon },
  { href: "/predictions", label: "Predictions", icon: ChartIcon },
  { href: "/slip", label: "Slip", icon: SlipIcon },
  { href: "/history", label: "History", icon: ChartIcon, desktopOnly: true },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

export function Nav() {
  const path = usePathname();
  const count = useSlip((s) => s.selections.length);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const { session } = useSession();
  const role = useRole(session);
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const badge = hydrated && count > 0 ? <span className="badge-count">{count}</span> : null;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand"><span className="brand-mark"><LogoMark /></span>MatchLens</Link>
          <nav className="nav" aria-label="Main">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined}>
                {l.label === "Slip" ? "My Slip" : l.label === "Predictions" ? "Strongest Predictions" : l.label === "History" ? "Prediction History" : l.label}
                {l.href === "/slip" && badge}
              </Link>
            ))}
            {role.data?.role === "admin" && <Link href="/admin" aria-current={isActive("/admin") ? "page" : undefined}>Admin</Link>}
          </nav>
        </div>
      </header>
      <nav className="tabbar" aria-label="Main">
        {LINKS.filter((l) => !l.desktopOnly).map((l) => (
          <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined}>
            <l.icon size={22} />
            {l.label}
            {l.href === "/slip" && badge}
          </Link>
        ))}
      </nav>
    </>
  );
}
