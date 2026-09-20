"""Compile every evaluation export into anonymised CSVs.

Anonymisation rules:
  - user_email is dropped entirely
  - the original participant_code is dropped (some contain real names)
  - the session UUID is dropped (it links back to the database)
  - participants become P01..Pnn, ordered by session start time

Codes are assigned deterministically from start time, so re-running this
script reproduces the same mapping without anyone storing a key file.

Duplicate exports of the same session (a partial download taken mid-session
and a later complete one) are collapsed to the most complete version.
"""
import csv
import json
import pathlib
import datetime

HERE = pathlib.Path(__file__).resolve().parent
REQS = [f"R{i}" for i in range(1, 19)]
TASKS = ["quick-capture", "optional-structure", "persistent-default", "blank-writing",
         "generation-boundary", "source-editing", "retention-deletion"]
GOV_FIELDS = ["data_flow_ok", "retention_ok", "processing_notice_ok", "prompt_wording_ok",
              "explainability_ok", "trust_calibration_ok", "human_control_ok", "fairness_ok"]


def sus_score(values):
    if not values or len(values) != 10:
        return None
    return sum((v - 1) if i % 2 == 0 else (5 - v) for i, v in enumerate(values)) * 2.5


def completeness(doc):
    """Used to pick the best copy when one session was exported more than once."""
    s = doc["session"]
    return (s.get("completed_at") is not None,
            len(doc.get("requirement_checks", [])),
            len(doc.get("events", [])))


# ---- load, de-duplicate by session id -------------------------------------
by_session = {}
for path in sorted(HERE.glob("*.json")):
    doc = json.loads(path.read_text())
    if "session" not in doc:
        continue
    sid = doc["session"]["id"]
    doc["_file"] = path.name
    if sid not in by_session or completeness(doc) > completeness(by_session[sid]):
        if sid in by_session:
            print(f"  superseded: {by_session[sid]['_file']} (kept {path.name})")
        by_session[sid] = doc
    else:
        print(f"  superseded: {path.name} (kept {by_session[sid]['_file']})")

ordered = sorted(by_session.values(), key=lambda d: d["session"]["started_at"])
codes = {id(d): f"P{i:02d}" for i, d in enumerate(ordered, 1)}


def row_for(doc):
    s = doc["session"]
    code = codes[id(doc)]
    checks = {c["requirement_id"]: c for c in doc.get("requirement_checks", [])}
    tasks = {t["task_id"]: t for t in doc.get("guided_tasks", [])}
    events = doc.get("events", [])
    gov = doc.get("governance_review")

    r1 = checks.get("R1", {}).get("evidence", {})
    gen = tasks.get("generation-boundary", {}).get("comprehension", {})
    src = tasks.get("source-editing", {}).get("comprehension", {})
    ret = tasks.get("retention-deletion", {}).get("comprehension", {})
    cap = tasks.get("quick-capture", {}).get("comprehension", {})
    pref = tasks.get("persistent-default", {}).get("comprehension", {})

    started = datetime.datetime.fromtimestamp(s["started_at"])
    completed_at = s.get("completed_at")

    row = {
        "participant": code,
        "device_type": s.get("device_type", ""),
        "age_group": s.get("age_group", ""),
        "text_editing_experience": s.get("text_editing_experience", ""),
        "session_date": started.strftime("%Y-%m-%d"),
        "session_completed": int(completed_at is not None),
        "session_duration_s": (completed_at - s["started_at"]) if completed_at else "",
        # outcome counts
        "n_requirements_recorded": len(checks),
        "n_pass": sum(1 for c in checks.values() if c["status"] == "pass"),
        "n_issue": sum(1 for c in checks.values() if c["status"] == "issue"),
        "n_critical": sum(1 for c in checks.values() if c["status"] == "critical"),
        "n_not_tested": sum(1 for c in checks.values() if c["status"] == "not_tested"),
        "n_tasks_completed": sum(1 for t in tasks.values() if t.get("completed_at_ms")),
        "n_events": len(events),
        "n_help_requests": sum(1 for e in events if e["event_type"] == "participant_help_requested"),
        # R1 headline metric
        "capture_duration_ms": r1.get("duration_ms", ""),
        "capture_within_5s": int(bool(tasks.get("quick-capture", {}).get("objective", {}).get("within_5s"))) if "quick-capture" in tasks else "",
        "capture_help_count": r1.get("help_count", ""),
        "capture_error_count": r1.get("error_count", ""),
        # comprehension
        "privacy_selected_data_correct": gen.get("selected_data_correct", ""),
        "privacy_processor_correct": gen.get("processor_correct", ""),
        "privacy_sent_already_correct": gen.get("sent_already_correct", ""),
        "privacy_correct_count": gen.get("correct_count", ""),
        "source_meaning_correct": src.get("source_meaning_correct", ""),
        "delete_scope_correct": ret.get("delete_scope_correct", ""),
        "retention_state_correct": ret.get("retention_state_correct", ""),
        "capture_expectation_correct": cap.get("expected_behavior_correct", ""),
        "preference_prediction_correct": pref.get("expected_behavior_correct", ""),
        # self-report
        "sus_score": sus_score(s.get("sus")),
        "ease_rating": (s.get("custom") or {}).get("ease_rating", ""),
        "control_rating": (s.get("custom") or {}).get("control_rating", ""),
        "privacy_clarity_rating": (s.get("custom") or {}).get("privacy_clarity_rating", ""),
        "has_comments": int(bool((s.get("custom") or {}).get("comments", "").strip())),
        "governance_reviewed": int(gov is not None),
    }
    for i, v in enumerate(s.get("sus") or [], 1):
        row[f"sus_q{i}"] = v
    for r in REQS:
        row[f"{r}_status"] = checks.get(r, {}).get("status", "")
    for t in TASKS:
        row[f"{t}_ms"] = tasks.get(t, {}).get("duration_ms", "")
        row[f"{t}_status"] = tasks.get(t, {}).get("status", "")
    for g in GOV_FIELDS:
        row[f"gov_{g}"] = "" if not gov else ("" if gov.get(g) is None else int(gov[g]))
    row["gov_prompt_flags_count"] = "" if not gov else gov.get("prompt_flags_count", "")
    return row


rows = [row_for(d) for d in ordered]

# stable column order: fixed keys first, then sus items, requirements, tasks, governance
task_cols = {f"{t}_ms" for t in TASKS} | {f"{t}_status" for t in TASKS}
req_cols = {f"{r}_status" for r in REQS}
head = [k for k in rows[0]
        if not k.startswith(("sus_q", "gov_")) and k not in task_cols and k not in req_cols]
head = list(dict.fromkeys(head))
cols = (head
        + [f"sus_q{i}" for i in range(1, 11)]
        + [f"{r}_status" for r in REQS]
        + [c for t in TASKS for c in (f"{t}_ms", f"{t}_status")]
        + [f"gov_{g}" for g in GOV_FIELDS] + ["gov_prompt_flags_count"])
cols = [c for c in dict.fromkeys(cols) if any(c in r for r in rows)]

with open(HERE / "evaluation_master.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow(r)

# ---- long formats ---------------------------------------------------------
with open(HERE / "evaluation_requirements_long.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["participant", "requirement_id", "status", "notes", "evidence_json"])
    for d in ordered:
        for c in sorted(d.get("requirement_checks", []), key=lambda x: int(x["requirement_id"][1:])):
            w.writerow([codes[id(d)], c["requirement_id"], c["status"],
                        c.get("notes", ""), json.dumps(c.get("evidence", {}), sort_keys=True)])

with open(HERE / "evaluation_tasks_long.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["participant", "task_id", "requirement_ids", "duration_ms",
                "status", "objective_json", "comprehension_json"])
    for d in ordered:
        for t in d.get("guided_tasks", []):
            w.writerow([codes[id(d)], t["task_id"],
                        "|".join(t.get("requirement_ids", [])), t.get("duration_ms", ""),
                        t.get("status", ""), json.dumps(t.get("objective", {}), sort_keys=True),
                        json.dumps(t.get("comprehension", {}), sort_keys=True)])

with open(HERE / "evaluation_events_long.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["participant", "seq", "event_type", "seconds_from_start", "metadata_json"])
    for d in ordered:
        t0 = d["session"]["started_at"]
        for i, e in enumerate(d.get("events", []), 1):
            w.writerow([codes[id(d)], i, e["event_type"],
                        e["created_at"] - t0, json.dumps(e.get("metadata", {}), sort_keys=True)])

print(f"\n  evaluation_master.csv            {len(rows)} rows x {len(cols)} columns")
print(f"  evaluation_requirements_long.csv {sum(len(d.get('requirement_checks', [])) for d in ordered)} rows")
print(f"  evaluation_tasks_long.csv        {sum(len(d.get('guided_tasks', [])) for d in ordered)} rows")
print(f"  evaluation_events_long.csv       {sum(len(d.get('events', [])) for d in ordered)} rows")
print(f"\n  participants: {', '.join(codes[id(d)] for d in ordered)}")
