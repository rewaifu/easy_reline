import "./Configurator.css";
import { Accessor, createEffect, onMount } from "solid-js";
import { Config, useNodesConfig } from "../../context/contexts";
import FsNode from "../fsnode/FsNode";
import ModelNode from "../modelnode/ModelNode";
import ResizeNode from "../resizenode/Resizenode";
import RunPanel from "../runpanel/RunPanel";
import { invoke } from "@tauri-apps/api/core";

interface ConfiguratorProps {
  port: Accessor<number | null>;
}

export default function Configurator(props: ConfiguratorProps) {
  const [config, setConfig] = useNodesConfig();
  onMount(async () => {
    try {
      const saved = await invoke<Config>("open_reline_config");
      setConfig(saved);
    } catch (e) {
      console.error("Failed to load config:", e);
    }
  });

  createEffect(() => {
    const currentConfig = config();
    (async () => {
      try {
        await invoke("save_config_reline", { config: currentConfig });
      } catch (err) {
        console.error("Ошибка при сохранении конфига:", err);
      }
    })();
  });

  return (
    <div class="nodes-panel">
      <div class="nodes-panel__header">
        <span class="nodes-panel__title">Nodes</span>
      </div>

      <div class="nodes-panel__list">
        <FsNode config={config} setConfig={setConfig} />
        <ModelNode config={config} setConfig={setConfig} />
        <ResizeNode config={config} setConfig={setConfig} />
      </div>

      <div class="nodes-panel__footer">
        <RunPanel config={config} port={props.port} />
      </div>
    </div>
  );
}
