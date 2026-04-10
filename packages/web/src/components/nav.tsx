import { Link, useLocation } from "react-router-dom";
import { useAccount } from "wagmi";
import { useStealthKeysContext } from "@/context/stealth-keys";
import { WalletButton } from "@/components/connect-button";
import { useEffect } from "react";

const links = [
  { href: "/setup", label: "Setup" },
  { href: "/send", label: "Send" },
  { href: "/receive", label: "Receive" },
  { href: "/about", label: "About" },
];

export function Nav() {
  const { pathname } = useLocation();
  const { isConnected } = useAccount();
  const { clear } = useStealthKeysContext();

  useEffect(() => {
    if (!isConnected) clear();
  }, [isConnected, clear]);

  return (
    <nav className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[720px] z-50 flex justify-between items-center px-6 h-16 bg-surface-container-low">
      <Link
        to="/"
        className="text-xl font-bold tracking-widest text-primary font-headline uppercase"
      >
        WRAITH
      </Link>
      <div className="hidden md:flex gap-6 items-center">
        {links.map((link) => (
          <Link
            key={link.href}
            to={link.href}
            className={`font-headline tracking-tighter uppercase text-xs transition-colors duration-150 ${
              pathname === link.href
                ? "text-primary font-bold"
                : "text-primary-container hover:text-primary"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <WalletButton />
    </nav>
  );
}
