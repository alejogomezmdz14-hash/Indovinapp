"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pais = process.env.NEXT_PUBLIC_PAIS?.trim() ?? "";

  if (pathname === "/login") {
    return <div className="min-h-screen bg-[#FFF8EE]">{children}</div>;
  }

  return (
    <>
      <Sidebar pais={pais || undefined} />
      <main className="ml-[260px] min-h-screen bg-[#FFF8EE] p-8">{children}</main>
    </>
  );
}
