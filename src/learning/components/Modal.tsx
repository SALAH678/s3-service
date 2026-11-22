import type { ReactNode } from "react";
import { X } from "lucide-react";

type ModalProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

export function Modal({ title, subtitle, onClose, children, footer, wide = false }: ModalProps) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className={wide ? "learn-modal learn-modal-wide" : "learn-modal"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="learn-modal-header">
          <div>
            {subtitle && <span>{subtitle}</span>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="learn-icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="learn-modal-body">{children}</div>
        {footer && <footer className="learn-modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}
