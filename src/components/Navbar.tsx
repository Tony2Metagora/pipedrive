"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LayoutDashboard, Upload, LogOut, TrendingUp, Users, Globe, Database, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions, canRead } from "@/hooks/usePermissions";
import type { ViewKey } from "@/lib/permissions";

const NAV_ITEMS: Array<{ href: string; label: string; icon: typeof Globe; viewKey: ViewKey }> = [
  { href: "/landing-generator", label: "Landing", icon: Globe, viewKey: "landing" },
  { href: "/dashboard", label: "Affaires", icon: LayoutDashboard, viewKey: "dashboard" },
  { href: "/prospects", label: "Prospects", icon: Users, viewKey: "prospects" },
  { href: "/pipeline", label: "Pipeline", icon: TrendingUp, viewKey: "pipeline" },
  { href: "/import", label: "Import", icon: Upload, viewKey: "import" },
  { href: "/scrapping", label: "Scrapping", icon: Database, viewKey: "scrapping" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { permissions, isAdmin, loading, name } = usePermissions();

  const visibleItems = loading
    ? NAV_ITEMS // show all while loading to avoid flash
    : NAV_ITEMS.filter((item) => canRead(permissions, item.viewKey));

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <span className="font-semibold text-lg text-gray-900">Prospection</span>
          </Link>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            {visibleItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  pathname.startsWith("/admin")
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <Settings className="w-4 h-4" />
                Admin
              </Link>
            )}
          </div>

          {/* User + Déconnexion */}
          <div className="flex items-center gap-2">
            {name && (
              <span className="text-xs text-gray-400 hidden sm:inline">{name}</span>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
