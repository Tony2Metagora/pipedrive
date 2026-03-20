import AppShell from "@/components/AppShell";

export default function ScrappingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <div className="mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px]">
        {children}
      </div>
    </AppShell>
  );
}
