import { CheckCircle2, Info, AlertTriangle, XCircle, X } from "lucide-react";
import type { Flash } from "../types";

const ICONS = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
};

export function FlashBanner({ flash, onDismiss }: { flash: Flash; onDismiss: () => void }) {
  const Icon = ICONS[flash.kind];
  return (
    <div className={`learn-flash learn-flash-${flash.kind}`} role="status">
      <Icon size={18} />
      <div>
        <strong>{flash.title}</strong>
        {flash.message && <p>{flash.message}</p>}
      </div>
      <button type="button" className="learn-icon-button" aria-label="Dismiss message" onClick={onDismiss}>
        <X size={16} />
      </button>
    </div>
  );
}
