import { Config } from "./contexts";

interface PipelineNode {
  type: string;
  options: Record<string, unknown>;
}

export function configToPipeline(config: Config): PipelineNode[] {
  const pipeline: PipelineNode[] = [];

  pipeline.push({
    type: "folder_reader",
    options: {
      path: config.in_dir,
      recursive: config.recursive,
      mode: "rgb",
    },
  });

  const upscaleOptions: Record<string, unknown> = {
    model: config.model_path,
    dtype: config.model_dtype,
    tiler: "exact",
    allow_cpu_upscale: config.model_allow_cpu_scale,
    exact_tiler_size: config.model_tile_size,
  };

  if (config.model_scale !== undefined) {
    upscaleOptions.target_scale = config.model_scale;
  }

  pipeline.push({
    type: "upscale",
    options: upscaleOptions,
  });

  if (config.target_size !== undefined) {
    pipeline.push({
      type: "resize",
      options: {
        filter: config.resize_down_format,
        [config.resize_mode]: config.target_size,
      },
    });
  }
  if (config.color_fix) {
    pipeline.push({
      type: "level",
      options: {
        low_input: 1,
        high_input: 254,
        low_output: 0,
        high_output: 255,
        gamma: 1,
      },
    });
  }

  pipeline.push({
    type: "folder_writer",
    options: {
      path: config.out_dir,
      format: "png",
    },
  });

  return pipeline;
}

export function configToJson(config: Config): string {
  return JSON.stringify(configToPipeline(config), null, 2);
}
