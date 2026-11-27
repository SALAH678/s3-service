import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { monthlyCostByClass, sumCostByClass, toChartRows } from "../../engine/cost";
import {
  LEARNING_STORAGE_CLASSES,
  STORAGE_CLASS_COLORS,
  classShortLabel,
  formatEarlyDeletionCharge,
  formatUsd,
} from "../../engine/storageClasses";
import { storedCostEntries, formatClock } from "../model";
import { useS3SimulatorStore } from "../../store/s3SimulatorStore";

export function CostMeter() {
  const { buckets, accruedCost, accruedByClass, earlyDeletionTotal, clockDay } = useS3SimulatorStore();
  const monthly = monthlyCostByClass(
    storedCostEntries(buckets).map((entry) => ({ size: entry.size, storageClass: entry.storageClass })),
  );

  return (
    <section className="learn-card" data-tour="cost-meter">
      <header className="learn-card-header">
        <div>
          <h2>Cost meter</h2>
          <p>{formatClock(clockDay)}</p>
        </div>
      </header>
      <div className="learn-card-body">
        <div className="learn-cost-total">
          <span>Running total</span>
          <strong>{formatUsd(accruedCost, 4)}</strong>
          <small>Storage accrued plus early-deletion charges.</small>
        </div>
        <div className="learn-stat-grid">
          <article>
            <span>Storage accrued</span>
            <strong>{formatUsd(accruedCost - earlyDeletionTotal, 4)}</strong>
          </article>
          <article>
            <span>Early deletion</span>
            <strong>{formatEarlyDeletionCharge(earlyDeletionTotal)}</strong>
          </article>
          <article>
            <span>Current monthly rate</span>
            <strong>{formatUsd(sumCostByClass(monthly), 4)}</strong>
          </article>
          <article>
            <span>Simulated day</span>
            <strong>{clockDay}</strong>
          </article>
        </div>
        <ul className="learn-cost-legend">
          {LEARNING_STORAGE_CLASSES.filter((storageClass) => accruedByClass[storageClass] > 0).map(
            (storageClass) => (
              <li key={storageClass}>
                <i style={{ background: STORAGE_CLASS_COLORS[storageClass] }} />
                <span>{classShortLabel(storageClass)}</span>
                <strong>{formatUsd(accruedByClass[storageClass], 4)}</strong>
              </li>
            ),
          )}
          {!LEARNING_STORAGE_CLASSES.some((storageClass) => accruedByClass[storageClass] > 0) && (
            <li className="learn-muted">Advance the clock to accrue cost.</li>
          )}
        </ul>
      </div>
    </section>
  );
}

export function CostChart() {
  const { costHistory } = useS3SimulatorStore();
  const rows = toChartRows(costHistory);

  return (
    <section className="learn-card" data-tour="cost-chart">
      <header className="learn-card-header">
        <div>
          <h2>Cost by storage class</h2>
          <p>Cumulative simulated cost. Transitioning classes bends each line.</p>
        </div>
      </header>
      <div className="learn-card-body">
        {rows.length ? (
          <div className="learn-chart">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7e7" />
                <XAxis dataKey="day" tickFormatter={(value) => `Day ${value}`} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => `$${Number(value).toFixed(2)}`} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value, name) => [formatUsd(Number(value), 4), String(name)]}
                  labelFormatter={(value) => `Day ${value}`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {LEARNING_STORAGE_CLASSES.map((storageClass) => (
                  <Area
                    key={storageClass}
                    type="monotone"
                    dataKey={storageClass}
                    name={classShortLabel(storageClass)}
                    stackId="cost"
                    stroke={STORAGE_CLASS_COLORS[storageClass]}
                    fill={STORAGE_CLASS_COLORS[storageClass]}
                    fillOpacity={0.35}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="learn-empty">
            The cost chart appears after you advance the virtual clock. Each point shows cumulative cost per
            storage class.
          </p>
        )}
      </div>
    </section>
  );
}
