"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, Upload, LogOut, TrendingUp, Users, Globe,
  Database, Settings, ChevronDown, User,
} from "lucide-react";
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    if (userMenuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userMenuOpen]);

  const visibleItems = loading
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => canRead(permissions, item.viewKey));

  const displayName = name || "Utilisateur";

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
          </div>

          {/* User dropdown menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">{displayName.charAt(0).toUpperCase()}</span>
              </div>
              <span className="hidden sm:inline">{displayName}</span>
              <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 transition-transform", userMenuOpen && "rotate-180")} />
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">{displayName}</p>
                  <p className="text-xs text-gray-400 truncate">{loading ? "…" : ""}</p>
                </div>
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setUserMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 text-sm transition-colors",
                      pathname.startsWith("/admin")
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    <Settings className="w-4 h-4" />
                    Administration
                  </Link>
                )}
                <button
                  onClick={() => { setUserMenuOpen(false); signOut({ callbackUrl: "/login" }); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
