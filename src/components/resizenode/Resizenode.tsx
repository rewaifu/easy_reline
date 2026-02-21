import "./ResizeNode.css";
import FilterList from "./filters.json";
import { Combobox } from "@kobalte/core/combobox";
import { Select } from "@kobalte/core/select";
import { NumberField } from "@kobalte/core/number-field";
import { FiCheck, FiChevronDown, FiMaximize2 } from "solid-icons/fi";
import { VsUnfold } from "solid-icons/vs";
import { Setter, Accessor, Show } from "solid-js";
import { Config } from "../../context/contexts";
import NodeCard from "../nodecard/NodeCard";

interface ResizeNodeProps {
  config: Accessor<Config>;
  setConfig: Setter<Config>;
}

export default function ResizeNode(props: ResizeNodeProps) {
  const targetSizeEnabled = () => props.config().target_size !== undefined;

  return (
    <NodeCard
      title="resize"
      icon={<FiMaximize2 size={12} />}
      defaultExpanded={false}
    >
      <label class="node-checkbox">
        <input
          type="checkbox"
          checked={targetSizeEnabled()}
          onChange={(e) => {
            if (e.currentTarget.checked) {
              props.setConfig((prev) => ({ ...prev, target_size: 1000 }));
            } else {
              props.setConfig((prev) => ({ ...prev, target_size: undefined }));
            }
          }}
        />
        <span class="node-checkbox__label">Enable target size</span>
      </label>

      <Show when={targetSizeEnabled()}>
        <div>
          <label class="field-label">Filter</label>
          <Combobox
            options={FilterList}
            placeholder="Select filter…"
            value={props.config().resize_down_format}
            onChange={(value) => {
              if (value !== null) {
                props.setConfig((prev) => ({
                  ...prev,
                  resize_down_format: value,
                }));
              }
            }}
            itemComponent={(itemProps) => (
              <Combobox.Item item={itemProps.item} class="select-item">
                <Combobox.ItemLabel>
                  {itemProps.item.rawValue}
                </Combobox.ItemLabel>
                <Combobox.ItemIndicator class="select-item__indicator">
                  <FiCheck size={12} />
                </Combobox.ItemIndicator>
              </Combobox.Item>
            )}
          >
            <Combobox.Control class="select-trigger" aria-label="Filter">
              <Combobox.Input class="combobox__input" />
              <Combobox.Trigger class="select-trigger__icon combobox__trigger-btn">
                <Combobox.Icon>
                  <VsUnfold size={14} />
                </Combobox.Icon>
              </Combobox.Trigger>
            </Combobox.Control>
            <Combobox.Portal>
              <Combobox.Content class="select-content">
                <Combobox.Listbox class="select-listbox" />
              </Combobox.Content>
            </Combobox.Portal>
          </Combobox>
        </div>

        <div>
          <label class="field-label">Resize mode</label>
          <Select
            value={props.config().resize_mode}
            options={["width", "height"]}
            placeholder="Select mode…"
            onChange={(value) => {
              props.setConfig((prev) => ({
                ...prev,
                resize_mode: value ?? "width",
              }));
            }}
            itemComponent={(item_props) => (
              <Select.Item item={item_props.item} class="select-item">
                <Select.ItemLabel>{item_props.item.rawValue}</Select.ItemLabel>
                <Select.ItemIndicator class="select-item__indicator">
                  <FiCheck size={12} />
                </Select.ItemIndicator>
              </Select.Item>
            )}
          >
            <Select.Trigger class="select-trigger" aria-label="Mode">
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


        <NumberField
          class="number-field"
          minValue={1}
          value={props.config().target_size ?? 1000}
          onChange={(value) =>
            props.setConfig((prev) => ({
              ...prev,
              target_size: Number(String(value).replace(/\s+/g, "")),
            }))
          }
        >
          <NumberField.Label class="number-field__label">
            Target size (px)
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
    </NodeCard>
  );
}
