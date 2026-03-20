import AppShell from "@/components/AppShell";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {children}
      </div>
    </AppShell>
  );
}
