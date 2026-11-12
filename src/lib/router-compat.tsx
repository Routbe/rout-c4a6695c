/**
 * Compatibility layer so components written against react-router-dom keep
 * working on TanStack Router. Only the surface actually used by this app.
 */
import {
  Link as TanstackLink,
  useNavigate as useTanstackNavigate,
  useParams as useTanstackParams,
  useRouterState,
} from "@tanstack/react-router";
import { forwardRef, useCallback, type AnchorHTMLAttributes, type ReactNode } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  replace?: boolean;
  children?: ReactNode;
};

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ to, ...rest }, ref) {
  // TanStack's Link is typed against the generated route tree; this app builds
  // paths dynamically, so widen the type here in one place.
  const AnyLink = TanstackLink as unknown as React.ComponentType<Record<string, unknown>>;
  return <AnyLink ref={ref} to={to} {...rest} />;
});

type NavLinkRenderProps = { isActive: boolean; isPending: boolean };

type NavLinkProps = Omit<LinkProps, "className" | "children"> & {
  className?: string | ((props: NavLinkRenderProps) => string);
  children?: ReactNode | ((props: NavLinkRenderProps) => ReactNode);
  end?: boolean;
};

export function NavLink({ to, className, children, end, ...rest }: NavLinkProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
  const renderProps: NavLinkRenderProps = { isActive, isPending: false };

  return (
    <Link
      to={to}
      className={typeof className === "function" ? className(renderProps) : className}
      {...rest}
    >
      {typeof children === "function" ? children(renderProps) : children}
    </Link>
  );
}

export type { NavLinkProps };

export function useNavigate() {
  const navigate = useTanstackNavigate();
  // Must be referentially stable: components list it in effect dependency
  // arrays, and a fresh function on every render re-runs those effects
  // forever (endless re-fetch loops).
  return useCallback(
    (to: string | number, options?: { replace?: boolean }) => {
      if (typeof to === "number") {
        if (typeof window !== "undefined") window.history.go(to);
        return;
      }
      navigate({ to, replace: options?.replace } as never);
    },
    [navigate],
  );
}

export function useParams<T extends Record<string, string | undefined>>(): T {
  return useTanstackParams({ strict: false } as never) as T;
}

export function useLocation() {
  return useRouterState({ select: (s) => s.location });
}
