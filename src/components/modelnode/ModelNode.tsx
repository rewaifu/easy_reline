import { Accessor, Setter, Show } from "solid-js";
import PathDropInput from "../pathdropinput/Pathdropinput";
import NodeCard from "../nodecard/NodeCard";
import { Config } from "../../context/contexts";
import { NumberField } from "@kobalte/core/number-field";
import { Select } from "@kobalte/core/select";
import { FiZap, FiChevronDown, FiCheck } from "solid-icons/fi";
import "./ModelNode.css";

interface ModelNodeProps {
  config: Accessor<Config>;
  setConfig: Setter<Config>;
}

const DTYPE_OPTIONS = ["F16", "F32", "BF16"];

export default function ModelNode(props: ModelNodeProps) {
  const showCustomScale = () => props.config().model_scale != null;

  return (
    <NodeCard title="upscale" icon={<FiZap size={13} />} defaultExpanded={true}>
      {/* Model Path */}
      <div>
        <div class="path_title">Model</div>
        <PathDropInput
          value={props.config().model_path}
          onChange={(value) =>
            props.setConfig((prev) => ({ ...prev, model_path: value }))
          }
          directory={false}
          placeholder="Drag a model file or browse…"
        />
      </div>

      {/* Tile size — controlled via value so it updates when config loads */}
      <NumberField
        class="number-field"
        minValue={128}
        step={128}
        value={props.config().model_tile_size}
        onChange={(value) =>
          props.setConfig((prev) => ({
            ...prev,
            model_tile_size: Number(String(value).replace(/\s+/g, "")),
          }))
        }
      >
        <NumberField.Label class="number-field__label">
          Tile size
        </NumberField.Label>
        <div class="number-field__group">
          <NumberField.Input class="number-field__input" />
          <div class="number-field__spinners">
            <NumberField.IncrementTrigger
              aria-label="Increment"
              class="number-field__increment"
            >
              ▲
            </NumberField.IncrementTrigger>
            <NumberField.DecrementTrigger
              aria-label="Decrement"
              class="number-field__decrement"
            >
              ▼
            </NumberField.DecrementTrigger>
          </div>
        </div>
      </NumberField>

      {/* DType — controlled via value */}
      <div>
        <label class="field-label">DType</label>
        <Select
          value={props.config().model_dtype}
          options={DTYPE_OPTIONS}
          onChange={(value) =>
            props.setConfig((prev) => ({
              ...prev,
              model_dtype: value ?? "F32",
            }))
          }
          itemComponent={(item_props) => (
            <Select.Item item={item_props.item} class="select-item">
              <Select.ItemLabel>{item_props.item.rawValue}</Select.ItemLabel>
              <Select.ItemIndicator class="select-item__indicator">
                <FiCheck size={12} />
              </Select.ItemIndicator>
            </Select.Item>
          )}
        >
          <Select.Trigger class="select-trigger" aria-label="DType">
            <Select.Value<string>>
              {(state) => state.selectedOption()}
            </Select.Value>
            <Select.Icon class="select-trigger__icon">
              <FiChevronDown size={14} />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content class="select-content">
              <Select.Listbox class="select-listbox" />
            </Select.Content>
          </Select.Portal>
        </Select>
      </div>

      <label class="node-checkbox">
        <input
          type="checkbox"
          checked={showCustomScale()}
          onChange={(e) => {
            if (e.currentTarget.checked) {
              // Set a default scale when enabling
              props.setConfig((prev) => ({ ...prev, model_scale: 2 }));
            } else {
              props.setConfig((prev) => ({ ...prev, model_scale: undefined }));
            }
          }}
        />
        <span class="node-checkbox__label">Target Scale model</span>
      </label>

      <Show when={showCustomScale()}>
        <NumberField
          class="number-field"
          minValue={1}
          maxValue={10}
          value={props.config().model_scale ?? 2}
          onChange={(value) =>
            props.setConfig((prev) => ({
              ...prev,
              model_scale: Number(String(value).replace(/\s+/g, "")),
            }))
          }
        >
          <NumberField.Label class="number-field__label">
            Model scale
          </NumberField.Label>
          <div class="number-field__group">
            <NumberField.Input class="number-field__input" />
            <div class="number-field__spinners">
              <NumberField.IncrementTrigger
                aria-label="Increment"
                class="number-field__increment"
              >
                ▲
              </NumberField.IncrementTrigger>
              <NumberField.DecrementTrigger
                aria-label="Decrement"
                class="number-field__decrement"
              >
                ▼
              </NumberField.DecrementTrigger>
            </div>
          </div>
        </NumberField>
      </Show>

      {/* Allow CPU upscale */}
      <label class="node-checkbox">
        <input
          type="checkbox"
          checked={props.config().model_allow_cpu_scale}
          onChange={(e) =>
            props.setConfig((prev) => ({
              ...prev,
              model_allow_cpu_scale: e.currentTarget.checked,
            }))
          }
        />
        <span class="node-checkbox__label">allow cpu upscale</span>
      </label>

      <label class="node-checkbox">
        <input
          type="checkbox"
          checked={props.config().color_fix}
          onChange={(e) =>
            props.setConfig((prev) => ({
              ...prev,
              color_fix: e.currentTarget.checked,
            }))
          }
        />
        <span class="node-checkbox__label">color fix</span>
      </label>
    </NodeCard>
  );
}
