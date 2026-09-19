import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

export type AuthUser = {
  google_id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
};

type AuthConfig = {
  enabled: boolean;
  googleClientId: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const GOOGLE_SCRIPT_ID = "google-identity-services";
const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();

  const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Google Sign-In could not be loaded.")),
        { once: true },
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Sign-In could not be loaded."));
    document.head.appendChild(script);
  });
}

function PasswordInput({
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  autoComplete: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-wrap">
      <input
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
          <circle cx="12" cy="12" r="3" />
          {visible ? <path d="M3 3l18 18" /> : null}
        </svg>
      </button>
    </span>
  );
}

const PASSWORD_MIN_LENGTH = 6;

const passwordRules = [
  { label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (p: string) => p.length >= PASSWORD_MIN_LENGTH },
  { label: "At least one letter", test: (p: string) => /[A-Za-z]/.test(p) },
  { label: "At least one number", test: (p: string) => /\d/.test(p) },
];

function validatePassword(password: string): string | null {
  const failed = passwordRules.find((rule) => !rule.test(password));
  return failed ? `Password needs: ${failed.label.toLowerCase()}.` : null;
}

function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="password-rules" aria-label="Password requirements">
      {passwordRules.map((rule) => (
        <li key={rule.label} className={rule.test(password) ? "met" : undefined}>
          {rule.test(password) ? "✓" : "○"} {rule.label}
        </li>
      ))}
    </ul>
  );
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Day / Month / Year dropdowns. `value` and `onChange` use an ISO date (YYYY-MM-DD) or "". */
function DateOfBirthInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const [initialYear = "", initialMonth = "", initialDay = ""] = value.split("-");
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth ? String(Number(initialMonth)) : "");
  const [day, setDay] = useState(initialDay ? String(Number(initialDay)) : "");

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1900 + 1 }, (_, i) => currentYear - i);
  // Limit days to the chosen month (and year, for leap years); 31 until a month is picked.
  const daysInMonth = month ? new Date(Number(year) || 2000, Number(month), 0).getDate() : 31;

  function update(next: { year?: string; month?: string; day?: string }) {
    const nextYear = next.year ?? year;
    const nextMonth = next.month ?? month;
    let nextDay = next.day ?? day;
    if (nextMonth) {
      const max = new Date(Number(nextYear) || 2000, Number(nextMonth), 0).getDate();
      if (Number(nextDay) > max) nextDay = "";
    }
    setYear(nextYear);
    setMonth(nextMonth);
    setDay(nextDay);
    onChange(
      nextYear && nextMonth && nextDay
        ? `${nextYear}-${nextMonth.padStart(2, "0")}-${nextDay.padStart(2, "0")}`
        : "",
    );
  }

  return (
    <span className="dob-row">
      <select
        aria-label="Day"
        required
        value={day}
        onChange={(event) => update({ day: event.target.value })}
      >
        <option value="">Day</option>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
          <option key={d} value={String(d)}>{d}</option>
        ))}
      </select>
      <select
        aria-label="Month"
        required
        value={month}
        onChange={(event) => update({ month: event.target.value })}
      >
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={String(i + 1)}>{name}</option>
        ))}
      </select>
      <select
        aria-label="Year"
        required
        value={year}
        onChange={(event) => update({ year: event.target.value })}
      >
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={String(y)}>{y}</option>
        ))}
      </select>
    </span>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleInitializedRef = useRef(false);
  const [view, setView] = useState<"login" | "register">("login");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    dateOfBirth: "",
    password: "",
    confirmPassword: "",
  });
  const setField = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const checkCurrentUser = useCallback(async () => {
    const response = await fetch("/api/auth/me", {
      credentials: "include",
      cache: "no-store",
    });

    if (response.status === 401) {
      setUser(null);
      return;
    }

    if (!response.ok) throw new Error("Could not check your sign-in status.");
    setUser((await response.json()) as AuthUser);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setError(null);
        const configResponse = await fetch("/api/auth/config", { cache: "no-store" });
        if (!configResponse.ok) throw new Error("Could not load authentication settings.");

        const nextConfig = (await configResponse.json()) as AuthConfig;
        if (!cancelled) setConfig(nextConfig);

        await checkCurrentUser();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Authentication failed.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [checkCurrentUser]);

  useEffect(() => {
    if (loading || user || !config?.enabled || !config.googleClientId || !googleButtonRef.current) {
      return;
    }

    const googleClientId = config.googleClientId;
    let cancelled = false;

    async function renderButton() {
      try {
        await loadGoogleScript();
        if (cancelled || !googleButtonRef.current || !window.google) return;

        if (!googleInitializedRef.current) {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            auto_select: false,
            callback: async ({ credential }) => {
              try {
                setError(null);
                const response = await fetch("/api/auth/google", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ credential }),
                });

                if (!response.ok) {
                  const payload = (await response.json().catch(() => null)) as
                    | { detail?: string }
                    | null;
                  throw new Error(payload?.detail ?? "Google sign-in failed.");
                }

                const payload = (await response.json()) as { user: AuthUser };
                setUser(payload.user);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Google sign-in failed.");
              }
            },
          });
          googleInitializedRef.current = true;
        }

        googleButtonRef.current.replaceChildren();
        const availableWidth = Math.floor(googleButtonRef.current.clientWidth);
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          // Match the full width of the email button (Google allows up to 400px).
          width: availableWidth > 0 ? Math.min(400, availableWidth) : 300,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Google sign-in failed.");
        }
      }
    }

    void renderButton();
    return () => {
      cancelled = true;
    };
  }, [config, loading, user, view]);

  async function submitEmailAuth(path: "login" | "register", payload: Record<string, string>) {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
        const detail = body?.detail;
        // FastAPI validation errors arrive as a list; show a friendly generic message.
        throw new Error(
          typeof detail === "string" ? detail : "Please check the details you entered.",
        );
      }
      const body = (await response.json()) as { user: AuthUser };
      setUser(body.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function switchView(next: "login" | "register") {
    setError(null);
    setView(next);
  }

  const logout = useCallback(async () => {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok && response.status !== 204) {
      throw new Error("Could not sign out.");
    }

    window.google?.accounts.id.disableAutoSelect();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, error, logout }),
    [user, loading, error, logout],
  );

  if (loading) {
    return (
      <main className="center-page">
        <p className="muted">Opening ReflectBlocks…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthContext.Provider value={value}>
        <main className="center-page">
          <section className="login-card" aria-labelledby="login-heading">
            <div className="brand-mark" aria-hidden="true">✦</div>
            <p className="eyebrow">ReflectBlocks</p>
            {view === "login" ? (
              <>
                <h1 id="login-heading">A quiet place to reflect.</h1>
                <p className="login-copy">
                  Sign in to keep your reflections connected to your account.
                </p>

                <form
                  className="auth-form"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    void submitEmailAuth("login", {
                      email: form.email,
                      password: form.password,
                    });
                  }}
                >
                  <label>
                    Email
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={form.email}
                      onChange={setField("email")}
                    />
                  </label>
                  <label>
                    Password
                    <PasswordInput
                      autoComplete="current-password"
                      value={form.password}
                      onChange={setField("password")}
                    />
                  </label>
                  <button className="primary-button" type="submit" disabled={submitting}>
                    {submitting ? "Signing in…" : "Login with email"}
                  </button>
                </form>

                <div className="auth-divider"><span>or</span></div>

                {config?.enabled ? (
                  <div className="google-button" ref={googleButtonRef} />
                ) : (
                  <p className="notice">
                    Google Sign-In is not configured yet. Add your Google client ID to <code>.env</code>.
                  </p>
                )}

                {error ? <p className="error" role="alert">{error}</p> : null}

                <p className="auth-switch">
                  New here?{" "}
                  <button type="button" className="link-button" onClick={() => switchView("register")}>
                    Create new account
                  </button>
                </p>
              </>
            ) : (
              <>
                <h1 id="login-heading">Create your account</h1>
                <p className="login-copy">A few details and you can start reflecting.</p>

                <form
                  className="auth-form"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    const passwordProblem = validatePassword(form.password);
                    if (passwordProblem) {
                      setError(passwordProblem);
                      return;
                    }
                    if (form.password !== form.confirmPassword) {
                      setError("Passwords do not match.");
                      return;
                    }
                    void submitEmailAuth("register", {
                      name: form.name,
                      email: form.email,
                      date_of_birth: form.dateOfBirth,
                      password: form.password,
                      confirm_password: form.confirmPassword,
                    });
                  }}
                >
                  <label>
                    Name
                    <input
                      type="text"
                      autoComplete="name"
                      required
                      maxLength={120}
                      value={form.name}
                      onChange={setField("name")}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={form.email}
                      onChange={setField("email")}
                    />
                  </label>
                  <div className="auth-field" role="group" aria-label="Date of birth">
                    Date of birth
                    <DateOfBirthInput
                      value={form.dateOfBirth}
                      onChange={(iso) => setForm((current) => ({ ...current, dateOfBirth: iso }))}
                    />
                  </div>
                  <label>
                    Password
                    <PasswordInput
                      autoComplete="new-password"
                      value={form.password}
                      onChange={setField("password")}
                    />
                    <PasswordRules password={form.password} />
                  </label>
                  <label>
                    Confirm password
                    <PasswordInput
                      autoComplete="new-password"
                      value={form.confirmPassword}
                      onChange={setField("confirmPassword")}
                    />
                  </label>
                  <button className="primary-button" type="submit" disabled={submitting}>
                    {submitting ? "Creating account…" : "Create account"}
                  </button>
                </form>

                {error ? <p className="error" role="alert">{error}</p> : null}

                <p className="auth-switch">
                  Already have an account?{" "}
                  <button type="button" className="link-button" onClick={() => switchView("login")}>
                    Back to login
                  </button>
                </p>
              </>
            )}
          </section>
        </main>
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
