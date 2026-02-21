import { createSignal, onMount, onCleanup, JSX } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import StatusBadge, { type Stage } from "./components/statusbadge/Statusbadge";
import Configurator from "./components/configurator/Configurator";
import "./App.css";
import { NodesConfig, defaultConfig, type Config } from "./context/contexts";

interface StatusEvent {
  stage: Stage;
  message: string;
  port: number | null;
}

export function NodeProvider(props: { children: JSX.Element }) {
  const [config, setConfig] = createSignal<Config>(defaultConfig);

  return (
    <NodesConfig.Provider value={[config, setConfig]}>
      {props.children}
    </NodesConfig.Provider>
  );
}

export default function App() {
  const [stage, setStage] = createSignal<Stage>("idle");
  const [message, setMessage] = createSignal("Initializing...");
  const [port, setPort] = createSignal<number | null>(null);
  const [scale, setScale] = createSignal(1);

  let unlisten: (() => void) | null = null;

  const MIN_SCALE = 0.4;
  const MAX_SCALE = 2.0;
  const STEP = 0.05;

  function handleWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setScale((s) => {
      const delta = e.deltaY > 0 ? -STEP : STEP;
      return Math.min(MAX_SCALE, Math.max(MIN_SCALE, +(s + delta).toFixed(2)));
    });
  }

  onMount(async () => {
    window.addEventListener("wheel", handleWheel, { passive: false });

    unlisten = await listen<StatusEvent>("backend-status", ({ payload }) => {
      setStage(payload.stage);
      setMessage(payload.message);
      if (payload.port) setPort(payload.port);
    });

    try {
      await invoke("initialize");
    } catch (e) {
      console.error("initialize failed:", e);
    }
  });

  onCleanup(() => {
    unlisten?.();
    window.removeEventListener("wheel", handleWheel);
  });

  return (
    <>
      <div
        class="app-zoom-root"
        style={{
          transform: `scale(${scale()})`,
          "transform-origin": "top left",
          width: `${(1 / scale()) * 100}%`,
          "min-height": `${(1 / scale()) * 100}%`,
        }}
      >
        <NodeProvider>
          <Configurator port={port} />
        </NodeProvider>
      </div>

      <StatusBadge stage={stage()} port={port()} message={message()} />
    </>
  );
}
