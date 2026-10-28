"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Giornata" },
  { href: "/storico", label: "Storico" },
];

export function Header() {
  const pathname = usePathname();
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="mark">M</span>
        <span>
          <strong>Margine</strong>
          <small>Serie A per SNAI</small>
        </span>
      </Link>
      <nav>
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href} className={active ? "active" : ""}>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
