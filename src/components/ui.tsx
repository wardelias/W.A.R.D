import type { ComponentProps, ReactNode } from "react";

/*
 * Plain, text-only primitives. No icons, no decoration.
 * Any text the user typed goes through UserText / TextField (dir="auto"),
 * so Hebrew, Arabic and English each render in their own direction.
 */

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "plain" | "quiet";

const buttonBase =
  "inline-flex min-h-11 items-center justify-center rounded-md px-3 text-[15px] font-medium select-none disabled:opacity-50";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg",
  plain: "border border-line text-fg",
  quiet: "text-fg underline-offset-4 hover:underline",
};

export function Button({
  variant = "plain",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button type={type} className={cx(buttonBase, buttonVariants[variant], className)} {...props} />
  );
}

export function buttonClass(variant: ButtonVariant = "plain", className?: string) {
  return cx(buttonBase, buttonVariants[variant], className);
}

/** Inline user text: direction follows its own content. */
export function UserText({ children, className, ...props }: ComponentProps<"span">) {
  return (
    <bdi dir="auto" className={className} {...props}>
      {children}
    </bdi>
  );
}

/** Block of user text that may span lines (notes). */
export function UserParagraph({ children, className, ...props }: ComponentProps<"p">) {
  return (
    <p dir="auto" className={cx("bidi-plain", className)} {...props}>
      {children}
    </p>
  );
}

const fieldBase =
  "block w-full rounded-md border border-line bg-bg px-3 py-2.5 text-[16px] text-fg placeholder:text-muted";

export function TextField({ className, ...props }: ComponentProps<"input">) {
  return <input dir="auto" className={cx(fieldBase, "min-h-11", className)} {...props} />;
}

export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea dir="auto" className={cx(fieldBase, "bidi-plain min-h-24", className)} {...props} />
  );
}

export function Label({ children, className, ...props }: ComponentProps<"label">) {
  return (
    <label className={cx("mb-1 block text-sm text-muted", className)} {...props}>
      {children}
    </label>
  );
}

export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("mt-8", className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">{title}</h2>
        {aside ? <div className="text-sm text-muted">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** A one-line message the user should act on (warnings, errors). */
export function Notice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="status" className={cx("border-s-2 border-fg ps-3 py-1 text-[15px]", className)}>
      {children}
    </div>
  );
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("text-muted", className)}>{children}</span>;
}
