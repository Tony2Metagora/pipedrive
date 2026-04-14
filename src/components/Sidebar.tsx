"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Users, Database, LayoutDashboard, Linkedin, Globe,
  Mail, ChevronDown, ChevronRight, LogOut, Settings,
  Home, Sparkles, Bot, PanelLeftClose, PanelLeftOpen, Flame, BarChart3, FileText, ListTodo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions, canRead } from "@/hooks/usePermissions";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Users;
  viewKey?: string;
  /** Visible uniquement si l’utilisateur est admin (après chargement des permissions). */
  adminOnly?: boolean;
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
      { href: "/dashboard", label: "Affaires", icon: LayoutDashboard, viewKey: "dashboard" },
      { href: "/pipeline", label: "Analytics", icon: BarChart3, viewKey: "pipeline" },
    ],
  },
  {
    label: "LinkedIn",
    icon: Linkedin,
    defaultOpen: false,
    items: [
      { href: "/linkedin", label: "Posts", icon: Linkedin, viewKey: "linkedin" },
      { href: "/linkedin/sources", label: "Sources", icon: FileText, viewKey: "linkedin" },
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
      { href: "/sequences/warmup", label: "Emails", icon: Flame },
      { href: "/sequences/warmup/domains", label: "Domains", icon: Globe },
    ],
  },
  {
    label: "Roadmap",
    icon: ListTodo,
    defaultOpen: false,
    items: [
      { href: "/roadmap", label: "Production", icon: ListTodo, adminOnly: true },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { permissions, isAdmin, loading, name } = usePermissions();
  const displayName = name || "Utilisateur";
  const [collapsed, setCollapsed] = useState(false);

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
    if (collapsed) { setCollapsed(false); }
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
      ? group.items.filter((item) => !item.adminOnly)
      : group.items.filter((item) => {
          if (item.adminOnly && !isAdmin) return false;
          return !item.viewKey || canRead(permissions, item.viewKey as never);
        }),
  })).filter((g) => g.items.length > 0);

  return (
    <aside
      className={cn(
        "bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0 z-40 shrink-0 transition-all duration-200",
        collapsed ? "w-14" : "w-52"
      )}
    >
      {/* Logo / Home + collapse toggle */}
      <div className={cn("h-14 flex items-center border-b border-gray-100", collapsed ? "px-2 justify-center" : "px-4 justify-between")}>
        <Link href="/prospects" className="flex items-center gap-2 group" title="Accueil">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-700 transition-colors shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          {!collapsed && <span className="text-sm font-semibold text-gray-900">Metagora</span>}
        </Link>
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer" title="Réduire">
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-1.5 py-3 space-y-1">
        {/* Home link */}
        <Link
          href="/prospects"
          className={cn(
            "flex items-center rounded-lg text-xs font-medium transition-colors",
            collapsed ? "justify-center px-0 py-2" : "gap-2.5 px-3 py-2",
            pathname === "/prospects"
              ? "bg-indigo-50 text-indigo-700"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          )}
          title="Accueil"
        >
          <Home className="w-4 h-4 shrink-0" />
          {!collapsed && "Accueil"}
        </Link>

        <div className="h-px bg-gray-100 my-2" />

        {/* Groups */}
        {filteredGroups.map((group) => {
          const isOpen = openGroups.has(group.label) && !collapsed;
          const hasActive = group.items.some((i) => pathname.startsWith(i.href));

          return (
            <div key={group.label}>
              {collapsed ? (
                // Collapsed: show group icon, clicking navigates to first item
                <Link
                  href={group.items[0]?.href || "#"}
                  className={cn(
                    "flex items-center justify-center py-2 rounded-lg transition-colors",
                    hasActive ? "bg-indigo-50 text-indigo-700" : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                  )}
                  title={group.label}
                >
                  <group.icon className="w-4 h-4" />
                </Link>
              ) : (
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
              )}

              {isOpen && (
                <div className="ml-3 mt-0.5 space-y-0.5">
                  {group.items.map((item) => {
                    const isActive =
                      item.href === "/sequences" || item.href === "/linkedin" || item.href === "/roadmap"
                        ? pathname === item.href
                        : pathname.startsWith(item.href);
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
      <div className={cn("border-t border-gray-100 py-3 space-y-1", collapsed ? "px-1.5" : "px-3")}>
        {collapsed ? (
          <>
            {isAdmin && (
              <Link href="/admin" className={cn("flex items-center justify-center py-1.5 rounded-lg transition-colors", pathname.startsWith("/admin") ? "text-indigo-700" : "text-gray-400 hover:text-gray-700")} title="Administration">
                <Settings className="w-4 h-4" />
              </Link>
            )}
            <button onClick={() => setCollapsed(false)} className="flex items-center justify-center w-full py-1.5 text-gray-400 hover:text-gray-600 cursor-pointer" title="Agrandir le menu">
              <PanelLeftOpen className="w-4 h-4" />
            </button>
            <div className="flex justify-center py-1">
              <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center" title={displayName}>
                <span className="text-white text-[10px] font-bold">{displayName.charAt(0).toUpperCase()}</span>
              </div>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </aside>
  );
}
