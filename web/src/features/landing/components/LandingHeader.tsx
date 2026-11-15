import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ChevronDown,
  GraduationCap,
  Menu,
  Moon,
  Sun,
  User,
  X,
} from "lucide-react";
import { Dialog, DropdownMenu } from "radix-ui";

import { BrandLockup } from "@/components/shared/Brand";
import { useResolvedTheme, writeThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { setLocale, useChosenLocale, type Locale } from "../i18n";
import { Link } from "./Link";
import { links, SECTIONS } from "../site";

const LANGUAGES: readonly { id: Locale; label: string; name: string }[] = [
  { id: "en", label: "EN", name: "English" },
  { id: "vi", label: "VI", name: "Tiếng Việt" },
];

function useSignInRows() {
  const { t } = useTranslation();
  return [
    {
      icon: User,
      href: links.studentSignIn(),
      label: t("landing.header.students"),
      sub: t("landing.header.studentsSub"),
    },
    {
      icon: GraduationCap,
      href: links.staffSignIn(),
      label: t("landing.header.staff"),
      sub: t("landing.header.staffSub"),
    },
  ];
}

function SignInRow({
  row,
  className,
  ...props
}: Readonly<
  { row: ReturnType<typeof useSignInRows>[number] } & React.ComponentProps<"a">
>) {
  const Icon = row.icon;
  return (
    <a
      {...props}
      href={row.href}
      className={cn(
        "text-fg hover:bg-hover data-highlighted:bg-hover flex items-center gap-2.5 rounded-md p-2 no-underline outline-none",
        className,
      )}
    >
      <span className="bg-muted grid size-[34px] shrink-0 place-items-center rounded-[9px]">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base leading-[1.35] font-medium">{row.label}</span>
        <span className="text-muted-fg text-meta block leading-[1.35]">{row.sub}</span>
      </span>
      <ArrowRight aria-hidden="true" className="text-muted-fg size-[15px] shrink-0" />
    </a>
  );
}

function LanguageSwitch({ ground }: Readonly<{ ground: "card" | "muted" }>) {
  const chosen = useChosenLocale();
  return (
    <div
      role="group"
      className={cn(
        "flex gap-0.5 rounded-lg p-[3px]",
        ground === "card" ? "bg-card" : "bg-muted",
      )}
    >
      {LANGUAGES.map((language) => {
        const on = language.id === chosen;
        return (
          <button
            key={language.id}
            type="button"
            lang={language.id}
            aria-label={language.name}
            aria-pressed={on}
            onClick={() => void setLocale(language.id)}
            className={cn(
              "h-[26px] cursor-pointer rounded-md px-[9px] text-xs font-semibold",
              on
                ? "bg-card text-fg shadow-card ring-border ring-1"
                : "text-muted-fg hover:text-fg",
            )}
          >
            {language.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * LandingHeader is the landing site's header: the logo, the three section
 * links from 960px, the language, the theme and the two sign-ins from 720px,
 * "Book a consultation" at every width, and below 960px a button that opens
 * the menu with whatever the row has no room for. `onBand` draws it on the
 * colour at the top of the Landing, without its line.
 */
export function LandingHeader({ onBand }: Readonly<{ onBand: boolean }>) {
  const { t } = useTranslation();
  const dark = useResolvedTheme() === "dark";
  const signInRows = useSignInRows();
  const [menuOpen, setMenuOpen] = useState(false);
  const ground = onBand ? "card" : "muted";
  const sections = SECTIONS.map((id) => ({ id, label: t(`landing.nav.${id}`) }));

  return (
    <header
      data-landing-chrome
      className={cn("relative z-[5] border-b", onBand && "border-transparent")}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-2.5 px-[18px] min-[720px]:gap-4 min-[720px]:px-7">
        <Link to="/" aria-label={t("landing.header.home")} className="flex shrink-0">
          <BrandLockup height={28} theme="auto" />
        </Link>
        <nav
          aria-label={t("landing.nav.label")}
          className="ml-3 hidden gap-0.5 min-[960px]:flex"
        >
          {sections.map((section) => (
            <Link
              key={section.id}
              to={`/#${section.id}`}
              className="text-muted-fg hover:text-fg inline-flex h-9 items-center rounded-lg px-3 text-base whitespace-nowrap no-underline"
            >
              {section.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden items-center gap-1.5 min-[720px]:flex">
            <LanguageSwitch ground={ground} />
            <button
              type="button"
              aria-label={
                dark ? t("landing.header.toLight") : t("landing.header.toDark")
              }
              onClick={() => writeThemePreference(dark ? "light" : "dark")}
              className="hover:bg-hover grid size-9 cursor-pointer place-items-center rounded-lg"
            >
              {dark ? (
                <Sun aria-hidden="true" className="size-[17px]" />
              ) : (
                <Moon aria-hidden="true" className="size-[17px]" />
              )}
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="bg-card text-fg data-[state=open]:bg-muted inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border pr-2.5 pl-3.5 text-base font-medium whitespace-nowrap">
                {t("landing.header.signIn")}
                <ChevronDown aria-hidden="true" className="text-muted-fg size-3.5" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className="bg-card shadow-float z-(--z-popover) w-[304px] rounded-[10px] border p-1.5"
                >
                  {signInRows.map((row) => (
                    <DropdownMenu.Item key={row.href} asChild>
                      <SignInRow row={row} />
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
          <Link
            to="/#consult"
            className="bg-primary text-primary-fg inline-flex h-9 items-center rounded-lg px-3.5 text-base font-medium whitespace-nowrap no-underline"
          >
            {t("landing.header.consult")}
          </Link>
          <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Dialog.Trigger
              aria-label={t("landing.header.menuOpen")}
              className="bg-card data-[state=open]:bg-muted grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border min-[960px]:hidden"
            >
              <Menu aria-hidden="true" className="size-[17px]" />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="bg-overlay fixed inset-0 z-(--z-sheet)" />
              <Dialog.Content
                aria-describedby={undefined}
                className="bg-card shadow-float fixed inset-y-0 right-0 z-(--z-sheet) flex w-[min(320px,88%)] flex-col border-l"
              >
                <div className="flex h-16 shrink-0 items-center justify-between gap-2.5 border-b pr-3 pl-5">
                  <Dialog.Title className="text-md font-semibold">
                    {t("landing.header.menuTitle")}
                  </Dialog.Title>
                  <Dialog.Close
                    aria-label={t("landing.header.menuClose")}
                    className="hover:bg-hover grid size-9 cursor-pointer place-items-center rounded-lg"
                  >
                    <X aria-hidden="true" className="size-[18px]" />
                  </Dialog.Close>
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2.5">
                  {sections.map((section) => (
                    <Link
                      key={section.id}
                      to={`/#${section.id}`}
                      onClick={() => setMenuOpen(false)}
                      className="text-fg hover:bg-hover text-title flex h-12 items-center rounded-lg px-2 font-medium no-underline"
                    >
                      {section.label}
                    </Link>
                  ))}
                  <div className="bg-border mx-2 my-2.5 h-px" />
                  <span className="text-muted-fg text-meta px-2 pt-1 pb-1.5 font-semibold">
                    {t("landing.header.signIn")}
                  </span>
                  {signInRows.map((row) => (
                    <SignInRow key={row.href} row={row} />
                  ))}
                  <div className="min-[720px]:hidden">
                    <div className="bg-border mx-2 my-2.5 h-px" />
                    <div className="flex items-center justify-between gap-2.5 px-2 py-1">
                      <span className="text-base">{t("landing.header.language")}</span>
                      <LanguageSwitch ground="muted" />
                    </div>
                    <div className="flex items-center justify-between gap-2.5 px-2 pt-2 pb-1">
                      <span id="landing-dark-mode" className="text-base">
                        {t("landing.header.darkMode")}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={dark}
                        aria-labelledby="landing-dark-mode"
                        onClick={() => writeThemePreference(dark ? "light" : "dark")}
                        className={cn(
                          "flex h-[22px] w-[38px] shrink-0 cursor-pointer rounded-full p-0.5",
                          dark ? "bg-primary justify-end" : "bg-border justify-start",
                        )}
                      >
                        <span className="bg-switch-thumb shadow-thumb size-[18px] rounded-full" />
                      </button>
                    </div>
                  </div>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
