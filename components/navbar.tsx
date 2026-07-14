import Link from "next/link";

export function Navbar() {
  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          My App
        </Link>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <Link href="/hsk" className="hover:text-foreground">
            HSK Checker
          </Link>
        </div>
      </nav>
    </header>
  );
}
