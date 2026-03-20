import AppShell from "@/components/AppShell";

export default function ProspectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </div>
    </AppShell>
  );
}
