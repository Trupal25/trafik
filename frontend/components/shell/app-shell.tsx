import { Sidebar } from "./sidebar";

/**
 * AppShell — the persistent frame around every authenticated page.
 * Sidebar on the left, page content on the right. The page is responsible
 * for its own header, padding, and scroll behavior.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
