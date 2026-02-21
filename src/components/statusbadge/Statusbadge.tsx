import { Show } from "solid-js";
import "./StatusBadge.css";


export type Stage =
  | "idle"
  | "cloning"
  | "creating_venv"
  | "installing"
  | "starting"
  | "running"
  | "error";


const STAGE_CONFIG: Record<
  Stage,
  { label: string; color: string; spin: boolean }
> = {
  idle: { label: "Idle", color: "#718096", spin: false },
  cloning: { label: "Cloning...", color: "#63b3ed", spin: true },
  creating_venv: { label: "Creating venv", color: "#63b3ed", spin: true },
  installing: { label: "Installing...", color: "#f6ad55", spin: true },
  starting: { label: "Starting...", color: "#f6ad55", spin: true },
  running: { label: "Running", color: "#68d391", spin: false },
  error: { label: "Error", color: "#fc8181", spin: false },
};


interface StatusBadgeProps {
  stage: Stage;
  port: number | null;
  message: string;
}


export default function StatusBadge(props: StatusBadgeProps) {
  const cfg = () => STAGE_CONFIG[props.stage];

  return (
    <div class="status-badge" style={{ "--clr": cfg().color } as any}>
      <div class="status-badge__dot-wrap">
        <div class="status-badge__dot" />
        <Show when={cfg().spin}>
          <div class="status-badge__spinner" />
        </Show>
      </div>

      <div class="status-badge__text">
        <div class="status-badge__label">
          {cfg().label}
          <Show when={props.stage === "running" && props.port}>
            <span class="status-badge__port">:{props.port}</span>
          </Show>
        </div>
        <Show when={props.message}>
          <div class="status-badge__message">{props.message}</div>
        </Show>
      </div>
    </div>
  );
}
