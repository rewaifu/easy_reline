import { Accessor, Setter } from "solid-js";
import PathDropInput from "../pathdropinput/Pathdropinput";
import NodeCard from "../nodecard/NodeCard";
import { Config } from "../../context/contexts";
import { FiFolder } from "solid-icons/fi";

interface FsNodeProps {
  config: Accessor<Config>;
  setConfig: Setter<Config>;
}

export default function FsNode(props: FsNodeProps) {
  return (
    <NodeCard
      title="folder_read_save"
      icon={<FiFolder size={13} />}
      defaultExpanded={true}
    >
      <div>
        <div class="path_title">Input Directory</div>
        <PathDropInput
          value={props.config().in_dir}
          onChange={(value) =>
            props.setConfig((prev) => ({ ...prev, in_dir: value }))
          }
        />
      </div>

      <div>
        <div class="path_title">Output Directory</div>
        <PathDropInput
          value={props.config().out_dir}
          onChange={(value) =>
            props.setConfig((prev) => ({ ...prev, out_dir: value }))
          }
        />
      </div>
      <label class="node-checkbox">
        <input
          type="checkbox"
          checked={props.config().recursive}
          onChange={(e) =>
            props.setConfig((prev) => ({
              ...prev,
              recursive: e.currentTarget.checked,
            }))
          }
        />
        <span class="node-checkbox__label">recursive</span>
      </label>
    </NodeCard>
  );
}
