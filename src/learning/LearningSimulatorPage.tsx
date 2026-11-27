import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Upload } from "lucide-react";
import { useS3SimulatorStore } from "../store/s3SimulatorStore";
import { downloadJson } from "./model";
import type { Flash, FlashHandler } from "./types";
import { BucketControls } from "./components/BucketControls";
import { CliPanel } from "./components/CliPanel";
import { ClockControls } from "./components/ClockControls";
import { CostChart, CostMeter } from "./components/CostPanel";
import { CreateBucketCard } from "./components/CreateBucketCard";
import { FlashBanner } from "./components/FlashBanner";
import { LifecycleBuilder } from "./components/LifecycleBuilder";
import { ObjectBrowser } from "./components/ObjectBrowser";
import { ScenarioPlayer } from "./components/ScenarioPlayer";
import { StorageClassCard } from "./components/StorageClassCard";
import { VersionTimeline } from "./components/VersionTimeline";
import "./learning.css";

export default function LearningSimulatorPage() {
  const {
    buckets,
    clockDay,
    recordListObjectVersions,
    reset,
    exportSimulatorState,
    importSimulatorState,
  } = useS3SimulatorStore();
  const [flash, setFlash] = useState<Flash | null>(null);
  const [selectedBucketName, setSelectedBucketName] = useState(
    () => useS3SimulatorStore.getState().buckets[0]?.name ?? "",
  );
  const [prefix, setPrefix] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState(() => {
    const first = useS3SimulatorStore.getState().buckets[0];
    return first?.objects.find((object) => !object.isFolder && !object.deleteMarker)?.key ?? "";
  });
  const importRef = useRef<HTMLInputElement>(null);

  const onFlash: FlashHandler = (next) => setFlash(next);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 8000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const bucket = buckets.find((candidate) => candidate.name === selectedBucketName) ?? buckets[0];

  const focusBucket = (name: string, list: typeof buckets) => {
    setSelectedBucketName(name);
    setPrefix("");
    setSearch("");
    setShowVersions(false);
    const next = list.find((candidate) => candidate.name === name);
    setSelectedKey(
      next?.objects.find((object) => !object.isFolder && !object.deleteMarker)?.key ?? "",
    );
  };

  const selectedObject = bucket && selectedKey
    ? bucket.objects.find((object) => object.key === selectedKey)
    : undefined;
  const ageInClassDays = selectedObject
    ? Math.max(0, clockDay - (selectedObject.storageClassChangedDay ?? selectedObject.createdDay ?? 0))
    : 0;

  const exportState = () => {
    const text = exportSimulatorState();
    downloadJson("s3-learning-simulator-state.json", JSON.parse(text) as unknown);
    onFlash({
      kind: "success",
      title: "State exported",
      message: "The JSON file contains buckets, versions, lifecycle rules, clock, and cost history.",
    });
  };

  const importState = async (file: File) => {
    const text = await file.text();
    const error = importSimulatorState(text);
    if (error) {
      onFlash({ kind: "error", title: "Import failed", message: error });
      return;
    }
    const stateBuckets = useS3SimulatorStore.getState().buckets;
    focusBucket(stateBuckets[0]?.name ?? "", stateBuckets);
    onFlash({
      kind: "success",
      title: "State imported",
      message: "Buckets, versions, lifecycle configuration, and simulator history were restored.",
    });
  };

  return (
    <main className="console-main learn-main">
      <div className="breadcrumbs">
        <span>Amazon S3</span>
        <b>›</b>
        <strong>Learning simulator</strong>
      </div>

      <div className="learn-page-title">
        <div>
          <span className="learn-kicker">AWS Cloud Club lab</span>
          <h1>S3 Learning Simulator</h1>
          <p>
            Create buckets, version objects, move data across storage classes, run lifecycle rules, and watch
            cost change over a virtual clock. Everything stays in this browser.
          </p>
        </div>
        <div className="learn-actions">
          <button type="button" className="learn-btn" onClick={() => importRef.current?.click()}>
            <Upload size={15} />
            Import JSON
          </button>
          <button type="button" className="learn-btn" onClick={exportState}>
            <Download size={15} />
            Export JSON
          </button>
          <button
            type="button"
            className="learn-btn learn-btn-danger"
            onClick={() => {
              if (!window.confirm("Reset the simulator to the seeded demo state?")) return;
              reset();
              const stateBuckets = useS3SimulatorStore.getState().buckets;
              focusBucket(stateBuckets[0]?.name ?? "", stateBuckets);
              onFlash({
                kind: "warning",
                title: "Simulator reset",
                message: "The seeded cloud-club-demo and cloud-club-archive buckets are back.",
              });
            }}
          >
            <RefreshCw size={15} />
            Reset simulator
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importState(file);
              event.target.value = "";
            }}
          />
        </div>
      </div>

      {flash && <FlashBanner flash={flash} onDismiss={() => setFlash(null)} />}

      <ScenarioPlayer />

      <div className="learn-grid">
        <div className="learn-primary">
          <CreateBucketCard onFlash={onFlash} onCreated={(name) => focusBucket(name, buckets)} />
          <BucketControls
            buckets={buckets}
            selectedName={bucket?.name ?? ""}
            onSelect={(name) => focusBucket(name, buckets)}
            onFlash={onFlash}
          />
          {bucket && (
            <>
              <ObjectBrowser
                bucket={bucket}
                prefix={prefix}
                onPrefixChange={setPrefix}
                showVersions={showVersions}
                onShowVersionsChange={setShowVersions}
                search={search}
                onSearchChange={setSearch}
                selectedKey={selectedKey}
                onSelectKey={(key) => {
                  setSelectedKey(key);
                  if (key) recordListObjectVersions(bucket.name, key);
                }}
                onFlash={onFlash}
              />
              {selectedObject && (
                <VersionTimeline bucket={bucket} object={selectedObject} onFlash={onFlash} />
              )}
              <StorageClassCard
                bucket={bucket}
                object={selectedObject}
                ageInClassDays={ageInClassDays}
                onFlash={onFlash}
              />
              <LifecycleBuilder bucket={bucket} onFlash={onFlash} />
              <CostChart />
            </>
          )}
        </div>

        <aside className="learn-rail">
          <CostMeter />
          <ClockControls onFlash={onFlash} />
          <CliPanel />
        </aside>
      </div>
    </main>
  );
}
