import { useState } from "react";
import { Check, Copy, Terminal, Trash2 } from "lucide-react";
import { copyText } from "../model";
import { useS3SimulatorStore } from "../../store/s3SimulatorStore";

export function CliPanel() {
  const { cliHistory, clearCliHistory } = useS3SimulatorStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState<"command" | "json" | null>(null);

  const entry = cliHistory.find((candidate) => candidate.id === selectedId) ?? cliHistory[0];

  const copy = async (kind: "command" | "json", text: string) => {
    await copyText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <section className="learn-card" data-tour="cli-panel">
      <header className="learn-card-header">
        <div>
          <h2>AWS CLI / JSON</h2>
          <p>Every simulator action produces the equivalent S3 API call.</p>
        </div>
        <Terminal size={20} />
      </header>
      <div className="learn-card-body">
        {entry ? (
          <>
            <div className="learn-cli-section">
              <div className="learn-cli-head">
                <span>AWS CLI command</span>
                <button type="button" className="learn-btn learn-btn-small" onClick={() => void copy("command", entry.command)}>
                  {copied === "command" ? <Check size={14} /> : <Copy size={14} />}
                  {copied === "command" ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="learn-cli-block">{entry.command}</pre>
            </div>
            <div className="learn-cli-section">
              <div className="learn-cli-head">
                <span>JSON response</span>
                <button type="button" className="learn-btn learn-btn-small" onClick={() => void copy("json", entry.jsonResponse)}>
                  {copied === "json" ? <Check size={14} /> : <Copy size={14} />}
                  {copied === "json" ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="learn-cli-block learn-cli-json">{entry.jsonResponse}</pre>
            </div>
            <ul className="learn-cli-history">
              {cliHistory.slice(0, 10).map((historyEntry) => (
                <li key={historyEntry.id}>
                  <button
                    type="button"
                    className={historyEntry.id === entry.id ? "active" : ""}
                    onClick={() => setSelectedId(historyEntry.id)}
                    title={historyEntry.command}
                  >
                    {historyEntry.command}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="learn-btn learn-btn-small" onClick={clearCliHistory}>
              <Trash2 size={14} />
              Clear history
            </button>
          </>
        ) : (
          <p className="learn-empty">
            No API calls yet. Create a bucket, upload an object, or change versioning to populate this panel.
          </p>
        )}
      </div>
    </section>
  );
}
