"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  FileCheck,
  Truck,
  Download,
  LogOut,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/libro-diario", label: "Libro diario", icon: BookOpen },
  { href: "/cheques", label: "Cheques", icon: FileCheck },
  { href: "/proveedores", label: "Proveedores", icon: Truck },
  { href: "/exportar", label: "Exportar", icon: Download },
];

interface SidebarProps {
  /** Texto libre, ej. "Argentina" — desde NEXT_PUBLIC_PAIS */
  pais?: string;
}

export default function Sidebar({ pais }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const authEnabled =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  async function handleLogout() {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      /* sin Supabase en el cliente */
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-[260px] bg-brand-black flex flex-col shadow-sidebar z-50">
      <div className="flex items-center gap-3 px-5 py-6">
        <Image
          src="/logo.png"
          alt="Indovina"
          width={48}
          height={48}
          className="rounded-full"
        />
        <div>
          <h1 className="text-lg font-bold text-brand-gold tracking-wide uppercase">
            Indovina
          </h1>
          <p className="text-[11px] text-gray-500 tracking-widest uppercase">
            Gestión
          </p>
          {pais ? (
            <p className="text-[11px] text-brand-gold/80 mt-0.5 font-medium">{pais}</p>
          ) : null}
        </div>
      </div>

      <div className="mx-5 mb-4 h-px bg-gradient-to-r from-brand-gold/20 via-brand-gold/10 to-transparent" />

      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);

            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-brand-gold text-brand-black shadow-btn"
                      : "text-gray-400 hover:text-brand-gold hover:bg-white/5"
                  }`}
                >
                  <Icon
                    size={20}
                    strokeWidth={1.8}
                    className={
                      isActive
                        ? "text-brand-black"
                        : "text-gray-500 group-hover:text-brand-gold"
                    }
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-5 py-4 space-y-2">
        {authEnabled ? (
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-medium text-gray-400 transition hover:border-brand-gold/40 hover:text-brand-gold"
          >
            <LogOut size={16} strokeWidth={1.8} />
            Salir
          </button>
        ) : null}
        <div className="rounded-xl bg-white/5 p-3">
          <p className="text-[11px] text-gray-500">Indovina Lomos</p>
          <p className="text-[10px] text-gray-600 mt-0.5">Panel financiero v1.0</p>
        </div>
      </div>
    </aside>
  );
}
