import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, GraduationCap, Highlighter, X } from "lucide-react";
import { SCENARIOS, scenarioById } from "../scenarios";
import { useS3SimulatorStore } from "../../store/s3SimulatorStore";

export function ScenarioPlayer() {
  const {
    learningScenario,
    startLearningScenario,
    setLearningScenarioStep,
    exitLearningScenario,
  } = useS3SimulatorStore();
  const [highlightNonce, setHighlightNonce] = useState(0);
  const scenario = scenarioById(learningScenario.scenarioId);
  const step = scenario?.steps[learningScenario.stepIndex];
  const target = step?.target;

  useEffect(() => {
    if (!target) return;
    const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("learn-tour-highlight");
    const timer = window.setTimeout(() => element.classList.remove("learn-tour-highlight"), 4000);
    return () => {
      window.clearTimeout(timer);
      element.classList.remove("learn-tour-highlight");
    };
  }, [target, highlightNonce, learningScenario.stepIndex, learningScenario.scenarioId]);

  if (!scenario || !step) {
    return (
      <section className="learn-card learn-scenarios" data-tour="scenario-player">
        <header className="learn-card-header">
          <div>
            <h2>Guided scenarios</h2>
            <p>Step-by-step tours that highlight the exact controls to use.</p>
          </div>
          <GraduationCap size={20} />
        </header>
        <div className="learn-card-body">
          <div className="learn-scenario-grid">
            {SCENARIOS.map((candidate) => (
              <article key={candidate.id} className="learn-scenario-card">
                <div className="learn-scenario-meta">
                  <span className="learn-badge">{candidate.level}</span>
                  <span className="learn-muted">{candidate.minutes} min</span>
                </div>
                <h3>{candidate.title}</h3>
                <p>{candidate.description}</p>
                <button
                  type="button"
                  className="learn-btn learn-btn-primary"
                  onClick={() => startLearningScenario(candidate.id)}
                >
                  Start scenario
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const isLast = learningScenario.stepIndex >= scenario.steps.length - 1;

  return (
    <section className="learn-card learn-scenario-active" data-tour="scenario-player">
      <header className="learn-card-header">
        <div>
          <h2>{scenario.title}</h2>
          <p>
            Step {learningScenario.stepIndex + 1} of {scenario.steps.length} · {scenario.level} ·{" "}
            {scenario.minutes} min
          </p>
        </div>
        <button type="button" className="learn-icon-button" aria-label="Exit scenario" onClick={exitLearningScenario}>
          <X size={18} />
        </button>
      </header>
      <div className="learn-card-body">
        <div className="learn-progress">
          {scenario.steps.map((candidate, index) => (
            <i
              key={candidate.id}
              className={
                index < learningScenario.stepIndex
                  ? "done"
                  : index === learningScenario.stepIndex
                    ? "active"
                    : ""
              }
            />
          ))}
        </div>
        <h3 className="learn-scenario-step">{step.title}</h3>
        <p>{step.explanation}</p>
        {step.hint && <p className="learn-note learn-note-info">Hint: {step.hint}</p>}
        {step.action && <p className="learn-muted">Try this action: {step.action}</p>}
        <div className="learn-actions">
          <button
            type="button"
            className="learn-btn"
            disabled={learningScenario.stepIndex === 0}
            onClick={() => setLearningScenarioStep(learningScenario.stepIndex - 1)}
          >
            <ArrowLeft size={15} />
            Back
          </button>
          <button
            type="button"
            className="learn-btn learn-btn-primary"
            onClick={() => {
              if (isLast) exitLearningScenario();
              else setLearningScenarioStep(learningScenario.stepIndex + 1);
            }}
          >
            {isLast ? "Finish scenario" : "Next"}
            {!isLast && <ArrowRight size={15} />}
          </button>
          <button
            type="button"
            className="learn-btn"
            disabled={!step.target}
            onClick={() => setHighlightNonce((value) => value + 1)}
          >
            <Highlighter size={15} />
            Show me
          </button>
          <button type="button" className="learn-btn" onClick={exitLearningScenario}>
            Exit
          </button>
        </div>
      </div>
    </section>
  );
}
