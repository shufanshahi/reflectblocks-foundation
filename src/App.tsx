import { useEffect, useState } from "react";

import { useAuth } from "./auth";
import { EvaluationPage } from "./components/EvaluationPage";
import { FreeWritingPage } from "./components/FreeWritingPage";
import { Home } from "./components/Home";
import { JournalEntryPage } from "./components/JournalEntryPage";
import { ParticipantEvaluationMode } from "./components/ParticipantEvaluationMode";
import { QuickThought } from "./components/QuickThought";
import { ReflectionWorkspace } from "./components/ReflectionWorkspace";
import { getEvaluationSessionId, trackUsability } from "./lib/usability";
import type { Reflection } from "./reflections";

type Screen = "home" | "new-reflection" | "workspace" | "journal" | "free-writing" | "evaluation" | "participant-evaluation";

export function App() {
  const { user, logout } = useAuth();
  const [screen, setScreen] = useState<Screen>("home");
  const [activeReflectionId, setActiveReflectionId] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evaluationActive, setEvaluationActive] = useState(() => Boolean(getEvaluationSessionId()));

  useEffect(() => {
    setEvaluationActive(Boolean(getEvaluationSessionId()));
    void trackUsability("screen_view", activeReflectionId, { screen });
  }, [activeReflectionId, screen]);

  function openWorkspace(reflection: Reflection) {
    setActiveReflectionId(reflection.id);
    setScreen("workspace");
  }

  function openJournal(reflection: Reflection) {
    setActiveReflectionId(reflection.id);
    setScreen("journal");
  }

  function openFreeWriting(reflection?: Reflection) {
    setActiveReflectionId(reflection?.id ?? null);
    setScreen("free-writing");
  }

  async function handleLogout() {
    try {
      setSigningOut(true);
      setError(null);
      await logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign out.");
    } finally {
      setSigningOut(false);
    }
  }

  function goHome() {
    setScreen("home");
    setActiveReflectionId(null);
  }

  return (
    <main id="main-content" className={`app-shell ${screen === "workspace" || screen === "participant-evaluation" ? "workspace-shell" : ""}`}>
      <a className="skip-link" href="#page-content">Skip to content</a>
      <header className="topbar">
        {screen === "participant-evaluation" ? (
          <div className="brand-button participant-brand-static" aria-label="ReflectBlocks evaluation mode">
            <span className="brand-symbol" aria-hidden="true">▦</span>
            ReflectBlocks · Evaluation
          </div>
        ) : (
          <button className="brand-button" type="button" onClick={goHome} aria-label="ReflectBlocks home">
            <span className="brand-symbol" aria-hidden="true">▦</span>
            ReflectBlocks
          </button>
        )}

        <div className="account">
          {evaluationActive && screen !== "participant-evaluation" ? (
            <button className="evaluation-header-badge" type="button" onClick={() => setScreen("evaluation")}>
              ● Study active
            </button>
          ) : null}
          {user?.picture_url ? (
            <img className="avatar" src={user.picture_url} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar fallback" aria-hidden="true">
              {(user?.name ?? user?.email ?? "R").slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="account-copy">
            <strong>{user?.name ?? "Signed in"}</strong>
            <span>{user?.email}</span>
          </div>
          {screen === "participant-evaluation" ? (
            <span className="evaluation-lock-badge">Evaluation-only mode</span>
          ) : (
            <button className="secondary-button" type="button" onClick={handleLogout} disabled={signingOut}>
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          )}
        </div>
      </header>

      <div id="page-content" tabIndex={-1}>
        {error ? <p className="error" role="alert">{error}</p> : null}

        {screen === "home" ? (
          <Home
            onNewReflection={() => setScreen("new-reflection")}
            onNewFreeWriting={() => openFreeWriting()}
            onOpenWorkspace={openWorkspace}
            onOpenJournal={openJournal}
            onOpenFreeWriting={openFreeWriting}
            onOpenEvaluation={() => setScreen("evaluation")}
          />
        ) : null}

        {screen === "new-reflection" ? (
          <QuickThought
            onCancel={() => setScreen("home")}
            onSaved={(reflection) => {
              setActiveReflectionId(reflection.id);
              setScreen("workspace");
              void trackUsability("quick_thought_saved", reflection.id, { char_count: reflection.quick_thought.length });
            }}
          />
        ) : null}

        {screen === "workspace" && activeReflectionId ? (
          <ReflectionWorkspace
            reflectionId={activeReflectionId}
            onBack={goHome}
            onOpenJournal={() => setScreen("journal")}
            onOpenFreeWriting={() => setScreen("free-writing")}
          />
        ) : null}

        {screen === "journal" && activeReflectionId ? (
          <JournalEntryPage
            reflectionId={activeReflectionId}
            onBack={goHome}
            onOpenWorkspace={() => setScreen("workspace")}
            onOpenFreeWriting={() => setScreen("free-writing")}
          />
        ) : null}

        {screen === "free-writing" ? (
          <FreeWritingPage
            reflectionId={activeReflectionId}
            onBack={goHome}
            onCreated={(reflectionId) => setActiveReflectionId(reflectionId)}
            onOpenWorkspace={activeReflectionId ? () => setScreen("workspace") : undefined}
          />
        ) : null}

        {screen === "evaluation" ? (
          <EvaluationPage
            onBack={() => {
              setEvaluationActive(Boolean(getEvaluationSessionId()));
              goHome();
            }}
            onStartTasks={() => {
              setEvaluationActive(true);
              setActiveReflectionId(null);
              setScreen("participant-evaluation");
            }}
          />
        ) : null}

        {screen === "participant-evaluation" ? (
          <ParticipantEvaluationMode
            onExit={() => setScreen("evaluation")}
            onFinish={() => setScreen("evaluation")}
          />
        ) : null}
      </div>
    </main>
  );
}
