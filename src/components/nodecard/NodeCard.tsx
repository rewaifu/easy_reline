import { createSignal, JSX, Show } from "solid-js";
import { FiChevronRight, FiChevronDown } from "solid-icons/fi";
import "./NodeCard.css";

interface NodeCardProps {
  title: string;
  icon?: JSX.Element;
  children: JSX.Element;
  defaultExpanded?: boolean;
}

export default function NodeCard(props: NodeCardProps) {
  const [expanded, setExpanded] = createSignal(props.defaultExpanded ?? false);

  return (
    <div class={`node-card${expanded() ? " node-card--expanded" : ""}`}>
      <div class="node-card__header">
        {/* Type label */}
        <div class="node-card__type">
          <Show when={props.icon}>
            <span class="node-card__type-icon">{props.icon}</span>
          </Show>
          <span class="node-card__type-label">{props.title}</span>
        </div>

        <div class="node-card__spacer" />

        <button
          class="node-card__expand-btn"
          onClick={() => setExpanded((v) => !v)}
          title={expanded() ? "Collapse" : "Expand"}
        >
          <Show when={expanded()} fallback={<FiChevronRight size={13} />}>
            <FiChevronDown size={13} />
          </Show>
        </button>
      </div>

      <Show when={expanded()}>
        <div class="node-card__body">{props.children}</div>
      </Show>
    </div>
  );
}
