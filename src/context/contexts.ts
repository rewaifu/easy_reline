import { createContext, useContext } from "solid-js";
import type { Accessor, Setter } from "solid-js";

export interface Config {
  in_dir: string;
  out_dir: string;
  model_path: string;
  model_tile_size: number;
  model_scale?: number;
  model_dtype: string;
  model_allow_cpu_scale: boolean;
  color_fix: boolean;
  target_size?: number;
  resize_mode: string;
  resize_down_format: string;
  recursive: boolean;
}

export const defaultConfig: Config = {
  in_dir: "",
  out_dir: "",
  model_path: "",
  model_tile_size: 512,
  model_dtype: "F32",
  model_allow_cpu_scale: false,
  color_fix: false,
  resize_mode: "width",
  resize_down_format: "linear",
  recursive: true,
};

export const NodesConfig = createContext<[Accessor<Config>, Setter<Config>]>();

export function useNodesConfig() {
  const ctx = useContext(NodesConfig);
  if (!ctx) {
    throw new Error(
      "useNodesConfig must be used inside NodeProvider!",
    );
  }
  return ctx;
}
