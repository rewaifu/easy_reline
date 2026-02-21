import { createSignal, Show, Accessor, onCleanup, createMemo } from "solid-js";
import { Config } from "../../context/contexts";
import { configToPipeline } from "../../context/pipeline";
import "./RunPanel.css";

interface RunPanelProps {
  config: Accessor<Config>;
  port: Accessor<number | null>;
}

type WsStatus = "running" | "done" | "cancelled" | "error" | "queued";

interface WsMessage {
  status: WsStatus | "ping" | "pong";
  progress?: number;
  data_len?: number;
  error?: string;
  message?: string;
}

function isConfigReady(config: Config): boolean {
  return (
    config.in_dir.trim() !== "" &&
    config.out_dir.trim() !== "" &&
    config.model_path.trim() !== ""
  );
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export default function RunPanel(props: RunPanelProps) {
  const [running, setRunning] = createSignal(false);
  const [progress, setProgress] = createSignal(0);
  const [total, setTotal] = createSignal(0);
  const [status, setStatus] = createSignal<WsStatus | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [wsRef, setWsRef] = createSignal<WebSocket | null>(null);

  const [startTime, setStartTime] = createSignal<number | null>(null);
  const [elapsed, setElapsed] = createSignal(0);
  let timerInterval: number | undefined;

  const WINDOW = 8;
  let progressHistory: Array<{ t: number; p: number }> = [];

  const ready = () => isConfigReady(props.config()) && props.port() !== null;

  let heartbeatInterval: number | undefined;

  onCleanup(() => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (timerInterval) clearInterval(timerInterval);
    wsRef()?.close();
  });

  function startTimer() {
    setStartTime(Date.now());
    setElapsed(0);
    timerInterval = window.setInterval(() => {
      const t = startTime();
      if (t !== null) setElapsed((Date.now() - t) / 1000);
    }, 500);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = undefined;
    }
  }

  const [rollingSpeed, setRollingSpeed] = createSignal<number | null>(null);

  function pushProgress(p: number) {
    const now = Date.now();
    progressHistory.push({ t: now, p });
    if (progressHistory.length > WINDOW) progressHistory.shift();

    if (progressHistory.length < 2) return;
    const first = progressHistory[0];
    const last = progressHistory[progressHistory.length - 1];
    const dt = (last.t - first.t) / 1000; 
    const dp = last.p - first.p;          
    if (dt > 0 && dp > 0) {
      setRollingSpeed(dp / dt);
    }
  }

  const eta = createMemo(() => {
    const s = rollingSpeed();
    const t = total();
    const p = progress();
    if (!s || s <= 0 || t <= 0) return null;
    return (t - p) / s;
  });

  function startHeartbeat(ws: WebSocket) {
    heartbeatInterval = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "ping" }));
      }
    }, 20000);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = undefined;
  }

  function reset() {
    setRunning(false);
    setProgress(0);
    setTotal(0);
    setStatus(null);
    setError(null);
    stopHeartbeat();
    stopTimer();
    setStartTime(null);
    setElapsed(0);
    setRollingSpeed(null);
    progressHistory = [];
  }

  function handleStart() {
    if (!ready() || running()) return;

    setRunning(true);
    setStatus("running");
    setError(null);
    setProgress(0);
    setTotal(0);
    setRollingSpeed(null);
    progressHistory = [];
    startTimer();

    let finished = false;

    let ws = wsRef();
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      ws = new WebSocket(`ws://localhost:${props.port()}/ws`);
      setWsRef(ws);

      ws.onopen = () => {
        ws!.send(JSON.stringify(configToPipeline(props.config())));
        startHeartbeat(ws!);
      };
    } else {
      ws.send(JSON.stringify(configToPipeline(props.config())));
      startHeartbeat(ws);
    }

    ws.onmessage = (e) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        setError("Invalid response from server");
        setStatus("error");
        setRunning(false);
        finished = true;
        stopHeartbeat();
        stopTimer();
        return;
      }

      if (msg.status === "ping" || msg.status === "pong") return;

      if (msg.error) {
        setError(msg.error);
        setStatus("error");
        setRunning(false);
        finished = true;
        stopHeartbeat();
        stopTimer();
        return;
      }

      setStatus(msg.status as WsStatus);
      if (msg.progress !== undefined) {
        setProgress(msg.progress);
        pushProgress(msg.progress);
      }
      if (msg.data_len !== undefined && msg.data_len > 0) setTotal(msg.data_len);

      if (["done", "cancelled", "error"].includes(msg.status as string)) {
        setRunning(false);
        finished = true;
        stopHeartbeat();
        stopTimer();
      }
    };

    ws.onerror = () => {
      if (finished) return;
      setError(`Could not connect to server at ws://localhost:${props.port()}`);
      setStatus("error");
      setRunning(false);
      finished = true;
      stopHeartbeat();
      stopTimer();
    };

    ws.onclose = () => {
      if (finished) return;
      setError("Connection lost, will attempt reconnect...");
      setStatus("queued");
      setRunning(false);
      stopHeartbeat();
      stopTimer();
      setTimeout(handleStart, 2000);
    };
  }

  function handleCancel() {
    const ws = wsRef();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "cancel" }));
    }
  }

  const pct = () =>
    total() > 0 ? Math.round((progress() / total()) * 100) : 0;

  return (
    <>
      <button
        class="run-btn"
        classList={{ "run-btn--disabled": !ready() || running() }}
        disabled={!ready() || running()}
        onClick={handleStart}
        title={
          props.port() === null
            ? "Waiting for backend server…"
            : !isConfigReady(props.config())
              ? "Fill in input dir, output dir and model path first"
              : ""
        }
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <polygon points="5,3 19,12 5,21" />
        </svg>
        Run pipeline
      </button>

      <Show when={running() || status() !== null}>
        <div class="run-overlay">
          <div class="run-overlay__header">
            <span class="run-overlay__title">
              <Show when={status() === "done"}>Done</Show>
              <Show when={status() === "cancelled"}>Cancelled</Show>
              <Show when={status() === "error"}>Error</Show>
              <Show
                when={
                  status() === "running" ||
                  status() === "queued" ||
                  status() === null
                }
              >
                {status() === "queued" ? "Waiting for worker..." : "Processing…"}
              </Show>
            </span>

            <Show when={!running()}>
              <button class="run-overlay__close" onClick={reset} title="Close">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </Show>
          </div>

          <Show when={error()}>
            <div class="run-overlay__error">{error()}</div>
          </Show>

          <Show when={!error()}>
            <div class="run-overlay__bar-wrap">
              <div
                class="run-overlay__bar"
                classList={{
                  "run-overlay__bar--done": status() === "done",
                  "run-overlay__bar--cancelled": status() === "cancelled",
                  "run-overlay__bar--indeterminate":
                    total() === 0 && running(),
                }}
                style={{ width: total() === 0 ? "100%" : `${pct()}%` }}
              />
            </div>

            <div class="run-overlay__stats">
              <Show when={total() > 0}>
                <span>
                  {progress()} / {total()}
                </span>
                <Show when={rollingSpeed() !== null && running()}>
                  <span class="run-overlay__speed">
                    {rollingSpeed()!.toFixed(2)} img/s
                  </span>
                </Show>
                <Show when={eta() !== null && running()}>
                  <span>ETA {formatTime(eta()!)}</span>
                </Show>
                <span>{pct()}%</span>
              </Show>

              <Show when={total() === 0 && running()}>
                <span>Connecting…</span>
              </Show>
              <Show when={!running() && elapsed() > 0 && status() !== null && status() !== "error"}>
                <span class="run-overlay__elapsed">
                  Total: {formatTime(elapsed())}
                </span>
              </Show>
            </div>
          </Show>

          <Show when={running()}>
            <button class="run-overlay__cancel" onClick={handleCancel}>
              Cancel
            </button>
          </Show>
        </div>
      </Show>
    </>
  );
}