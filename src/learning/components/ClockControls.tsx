import { useState } from "react";
import { Clock, FastForward, RotateCcw } from "lucide-react";
import { formatClock, simulationDateLabel } from "../model";
import { useS3SimulatorStore } from "../../store/s3SimulatorStore";
import { wait, type FlashHandler } from "../types";

const LOG_LABELS = {
  transition: "Transition",
  expiration: "Expiration",
  noncurrent: "Noncurrent",
  multipart: "Multipart",
  penalty: "Penalty",
};

export function ClockControls({ onFlash }: { onFlash: FlashHandler }) {
  const { clockDay, advanceClock, resetClock, lifecycleLog } = useS3SimulatorStore();
  const [busy, setBusy] = useState(false);

  const advance = async (days: number) => {
    setBusy(true);
    await wait(260);
    advanceClock(days);
    setBusy(false);
    onFlash({
      kind: "info",
      title: `Clock advanced ${days} day${days === 1 ? "" : "s"}`,
      message: `Lifecycle rules ran day by day. Simulated date is now ${simulationDateLabel(clockDay + days)}.`,
    });
  };

  return (
    <section className="learn-card" data-tour="clock-controls">
      <header className="learn-card-header">
        <div>
          <h2>Virtual clock</h2>
          <p>{formatClock(clockDay)}</p>
        </div>
        <Clock size={20} />
      </header>
      <div className="learn-card-body">
        <div className="learn-clock-display">
          <span>Simulated date</span>
          <strong>{simulationDateLabel(clockDay)}</strong>
          <small>Every day runs lifecycle transitions, expirations, multipart cleanup, and cost accrual.</small>
        </div>
        <div className="learn-actions">
          <button type="button" className="learn-btn" disabled={busy} onClick={() => void advance(1)}>
            <FastForward size={15} />+1 day
          </button>
          <button
            type="button"
            className="learn-btn"
            data-tour="clock-btn-30"
            disabled={busy}
            onClick={() => void advance(30)}
          >
            <FastForward size={15} />+30 days
          </button>
          <button type="button" className="learn-btn" disabled={busy} onClick={() => void advance(90)}>
            <FastForward size={15} />+90 days
          </button>
          <button
            type="button"
            className="learn-btn"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Reset the virtual clock and clear accrued cost history?")) return;
              resetClock();
              onFlash({
                kind: "warning",
                title: "Clock reset",
                message: "The clock is back at day 0 and the cost history was cleared. Existing object changes remain.",
              });
            }}
          >
            <RotateCcw size={15} />
            Reset clock
          </button>
        </div>

        <div className="learn-log">
          <h3>Recent lifecycle activity</h3>
          {lifecycleLog.length ? (
            <ul>
              {lifecycleLog.slice(0, 8).map((entry) => (
                <li key={entry.id}>
                  <span className={`learn-badge learn-badge-${entry.type}`}>{LOG_LABELS[entry.type]}</span>
                  <span>Day {entry.day}</span>
                  <span>{entry.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="learn-empty">No lifecycle actions yet. Save a rule, then advance the clock.</p>
          )}
        </div>
      </div>
    </section>
  );
}
