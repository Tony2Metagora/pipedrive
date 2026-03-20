import AppShell from "@/components/AppShell";

export default function PipelineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {children}
      </div>
    </AppShell>
  );
}
