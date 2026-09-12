import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import {
  IconPencil,
  IconEye,
  IconTriangleFilled,
  IconCircleFilled,
  IconSquareRotatedFilled,
  IconStarFilled,
  IconHeartFilled,
  IconMoonFilled,
  IconFlowerFilled,
  IconBoltFilled,
  IconCloudFilled,
  IconLeafFilled,
  IconX,
  IconChevronRight,
  IconDeviceGamepad2,
  IconHistory,
  IconMessage,
} from "@tabler/icons-react";
import type { AnonymousId, Role } from "../../shared/protocol";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
}) {
  return (
    <button
      type="button"
      className={`button ${variant} ${className}`}
      {...props}
    />
  );
}
export function RoleIcon({ role, size = 24 }: { role: Role; size?: number }) {
  const Icon = role === "respondent" ? IconPencil : IconEye;
  return <Icon size={size} stroke={1.75} className="role-icon" aria-hidden />;
}
const identityIcons = {
  A: IconTriangleFilled,
  B: IconCircleFilled,
  C: IconSquareRotatedFilled,
  D: IconStarFilled,
  E: IconHeartFilled,
  F: IconMoonFilled,
  G: IconFlowerFilled,
  H: IconBoltFilled,
  I: IconCloudFilled,
  J: IconLeafFilled,
};
export function Identity({
  id,
  large = false,
}: {
  id: AnonymousId;
  large?: boolean;
}) {
  const Icon = identityIcons[id];
  return (
    <span className={`identity ${large ? "large" : ""}`}>
      <Icon size={large ? 32 : 20} aria-hidden />
      <span>{id}</span>
    </span>
  );
}
export function Avatar({ initial, src }: { initial: string; src?: string }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  return (
    <span className="avatar" aria-hidden>
      {src && src !== failedSrc ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
export type Tab = "play" | "history" | "topics";
export function Navigation({
  value,
  onChange,
  revealed = false,
}: {
  value: Tab;
  onChange: (tab: Tab) => void;
  revealed?: boolean;
}) {
  const tabs = [
    { id: "play", label: "プレイ", Icon: IconDeviceGamepad2 },
    {
      id: "history",
      label: revealed ? "振り返り" : "回答履歴",
      Icon: IconHistory,
    },
    { id: "topics", label: "お題", Icon: IconMessage },
  ] as const;
  return (
    <>
      <header className="app-header">
        <span className="brand">pittan</span>
        <nav className="desktop-nav">
          {tabs
            .filter(
              (t) => !revealed || value !== "history" || t.id !== "topics",
            )
            .map((t) => (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                aria-current={value === t.id ? "page" : undefined}
              >
                {t.label}
              </button>
            ))}
        </nav>
      </header>
      <nav className="mobile-nav">
        {tabs
          .filter((t) => !revealed || t.id !== "topics")
          .map((t) => (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              aria-current={value === t.id ? "page" : undefined}
            >
              <span>
                <t.Icon size={24} stroke={1.75} aria-hidden />
              </span>
              {t.label}
            </button>
          ))}
      </nav>
    </>
  );
}
export function QuestionHeading({
  number,
  children,
}: {
  number: number;
  children: ReactNode;
}) {
  return (
    <div className="question-heading">
      <span className="question-marker">
        <span>Q{number}</span>
        <img src="/assets/figma/question-tail.svg" alt="" />
      </span>
      <h2>{children}</h2>
    </div>
  );
}
export function HistoryLink({ onClick }: { onClick: () => void }) {
  return (
    <button className="history-link" onClick={onClick}>
      履歴
      <IconChevronRight size={16} stroke={2.5} aria-hidden />
    </button>
  );
}
export function Modal({
  title,
  children,
  actions,
  onClose,
  kind = "sheet",
  className = "",
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  kind?: "sheet" | "proposal";
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const dialog = ref.current!,
      previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const input = dialog.querySelector<HTMLTextAreaElement>("textarea");
    if (input) input.focus();
    else dialog.focus();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      className={`modal ${kind} ${className}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          const b = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        {onClose && (
          <Button
            variant="quiet"
            className="close-button"
            aria-label="閉じる"
            onClick={onClose}
          >
            <IconX size={20} stroke={1.75} />
          </Button>
        )}
      </div>
      {children}
      {actions && <div className="modal-actions">{actions}</div>}
    </dialog>
  );
}
