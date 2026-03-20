"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Users, Database, LayoutDashboard, Linkedin, Globe,
  Mail, ChevronDown, ChevronRight, LogOut, Settings,
  Home, Sparkles, Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions, canRead } from "@/hooks/usePermissions";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Users;
  viewKey?: string;
}

interface NavGroup {
  label: string;
  icon: typeof Users;
  items: NavItem[];
  defaultOpen?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Leads",
    icon: Users,
    defaultOpen: true,
    items: [
      { href: "/scrapping", label: "Scrapping", icon: Database, viewKey: "scrapping" },
      { href: "/prospects", label: "Prospects", icon: Users, viewKey: "prospects" },
      { href: "/pipeline", label: "Affaires", icon: LayoutDashboard, viewKey: "pipeline" },
    ],
  },
  {
    label: "LinkedIn",
    icon: Linkedin,
    defaultOpen: false,
    items: [
      { href: "/linkedin", label: "Posts", icon: Linkedin, viewKey: "linkedin" },
    ],
  },
  {
    label: "GenAI",
    icon: Sparkles,
    defaultOpen: false,
    items: [
      { href: "/landing-generator", label: "Landing", icon: Globe, viewKey: "landing" },
    ],
  },
  {
    label: "Séquence Mail",
    icon: Mail,
    defaultOpen: false,
    items: [
      { href: "/sequences", label: "Campagnes", icon: Mail },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { permissions, isAdmin, loading, name } = usePermissions();
  const displayName = name || "Utilisateur";

  // Track which groups are open
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    NAV_GROUPS.forEach((g) => {
      if (g.defaultOpen || g.items.some((i) => pathname.startsWith(i.href))) {
        initial.add(g.label);
      }
    });
    return initial;
  });

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const filteredGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: loading
      ? group.items
      : group.items.filter((item) => !item.viewKey || canRead(permissions, item.viewKey as never)),
  })).filter((g) => g.items.length > 0);

  return (
    <aside className="w-52 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0 z-40 shrink-0">
      {/* Logo / Home */}
      <div className="px-4 h-14 flex items-center gap-2.5 border-b border-gray-100">
        <Link href="/prospects" className="flex items-center gap-2 group">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-700 transition-colors">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-900">Metagora</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {/* Home link */}
        <Link
          href="/prospects"
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
            pathname === "/prospects"
              ? "bg-indigo-50 text-indigo-700"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          )}
        >
          <Home className="w-4 h-4" />
          Accueil
        </Link>

        <div className="h-px bg-gray-100 my-2" />

        {/* Groups */}
        {filteredGroups.map((group) => {
          const isOpen = openGroups.has(group.label);
          const hasActive = group.items.some((i) => pathname.startsWith(i.href));

          return (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
                  hasActive ? "text-indigo-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                )}
              >
                <group.icon className="w-4 h-4" />
                <span className="flex-1 text-left">{group.label}</span>
                {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>

              {isOpen && (
                <div className="ml-3 mt-0.5 space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                          isActive
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                        )}
                      >
                        <item.icon className="w-3.5 h-3.5" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-gray-100 px-3 py-3 space-y-1">
        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              pathname.startsWith("/admin")
                ? "bg-indigo-50 text-indigo-700"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            )}
          >
            <Settings className="w-3.5 h-3.5" />
            Administration
          </Link>
        )}
        <div className="flex items-center gap-2 px-3 py-1.5">
          <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center shrink-0">
            <span className="text-white text-[10px] font-bold">{displayName.charAt(0).toUpperCase()}</span>
          </div>
          <span className="text-xs font-medium text-gray-700 truncate flex-1">{displayName}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
            title="Déconnexion"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
