import AppShell from "@/components/AppShell";

export default function LinkedInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {children}
      </div>
    </AppShell>
  );
}
