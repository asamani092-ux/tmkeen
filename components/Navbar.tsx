import Image from "next/image";
import { LogOut, LayoutDashboard } from "lucide-react";
import { getDashboardPath } from "@/lib/auth";
import FullPageLink from "@/components/FullPageLink";
import NotificationBell from "@/components/NotificationBell";
import type { Role } from "@/generated/prisma/client";

type NavbarProps = {
  showAuth?: boolean;
  userName?: string;
  userRole?: Role;
  userId?: string;
  logoutHref?: string;
};

export default function Navbar({
  showAuth = true,
  userName,
  userRole,
  userId,
  logoutHref = "/api/auth/logout",
}: NavbarProps) {
  const dashboardHref = userRole
    ? getDashboardPath(userRole)
    : userName
      ? "/dashboard"
      : null;

  return (
    <header className="border-b border-surface-border bg-surface shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          {userName && (
            <span className="hidden text-sm text-brand-gray sm:inline">
              مرحباً، {userName}
            </span>
          )}
          {showAuth && userId && <NotificationBell />}
          {showAuth && (
            <nav className="flex items-center gap-3 text-sm">
              {userName && dashboardHref ? (
                <>
                  <FullPageLink
                    href={dashboardHref}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-brand-gray transition hover:bg-surface-muted hover:text-primary"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    لوحة التحكم
                  </FullPageLink>
                  <form action={logoutHref} method="POST">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-brand-gray transition hover:bg-surface-muted hover:text-primary"
                    >
                      <LogOut className="h-4 w-4" />
                      خروج
                    </button>
                  </form>
                </>
              ) : (
                <FullPageLink
                  href="/login"
                  className="btn-primary !px-4 !py-2 text-sm"
                >
                  تسجيل الدخول
                </FullPageLink>
              )}
            </nav>
          )}
        </div>

        <FullPageLink href="/" className="flex items-center">
          <Image
            src="/logo.png"
            alt="شعار جمعية الزاد"
            width={300}
            height={179}
            className="h-14 w-auto object-contain"
            priority
            unoptimized
          />
        </FullPageLink>
      </div>
    </header>
  );
}
