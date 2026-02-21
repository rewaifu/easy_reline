import {
  createSignal,
  createUniqueId,
  Show,
  onMount,
  onCleanup,
  createEffect,
} from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./PathDropInput.css";

interface PathDropInputProps {
  value?: string;
  onChange?: (path: string) => void;
  label?: string;
  placeholder?: string;
  directory?: boolean;
}

export default function PathDropInput(props: PathDropInputProps) {
  const id = createUniqueId();
  const [over, setOver] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;
  let zoneRef: HTMLDivElement | undefined;
  const directory = () => props.directory ?? true;

  function emit(path: string) {
    if (!path) return;
    if (inputRef) inputRef.value = path;
    props.onChange?.(path);
  }

  // ← fix: реагируем на изменение props.value (асинхронная загрузка конфига)
  createEffect(() => {
    const v = props.value ?? "";
    if (inputRef && inputRef.value !== v) {
      inputRef.value = v;
    }
  });

  onMount(async () => {
    const unlisten = await getCurrentWindow().onDragDropEvent((e) => {
      if (e.payload.type === "over") {
        if (zoneRef) {
          const { x, y } = (e.payload as any).position ?? {};
          const rect = zoneRef.getBoundingClientRect();
          const isOver =
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom;
          setOver(isOver);
        }
      } else if (e.payload.type === "leave") {
        setOver(false);
      } else if (e.payload.type === "drop") {
        if (over()) {
          setOver(false);
          const paths: string[] = (e.payload as any).paths ?? [];
          if (paths.length > 0) emit(paths[0]);
        } else {
          setOver(false);
        }
      }
    });

    onCleanup(unlisten);
  });

  function suppressBrowser(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function handleBrowse() {
    const result = await open({
      directory: directory(),
      multiple: false,
      title: directory() ? "Select folder" : "Select file",
    });
    if (typeof result === "string" && result) emit(result);
  }

  return (
    <div class="path-input">
      <Show when={props.label}>
        <label class="path-input__label" for={id}>
          {props.label}
        </label>
      </Show>

      <div
        ref={zoneRef}
        class={`path-input__zone${over() ? " path-input__zone--over" : ""}`}
        onDragOver={suppressBrowser}
        onDragEnter={suppressBrowser}
        onDrop={suppressBrowser}
      >
        <svg class="path-input__border" aria-hidden="true">
          <rect
            x="0.75"
            y="0.75"
            width="calc(100% - 1.5px)"
            height="calc(100% - 1.5px)"
            rx="7"
            ry="7"
          />
        </svg>

        <div class="path-input__inner">
          <span class="path-input__icon" aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </span>

          <input
            ref={inputRef}
            id={id}
            class="path-input__field"
            type="text"
            placeholder={
              props.placeholder ??
              (directory()
                ? "Drag a folder or type a path…"
                : "Drag a file or type a path…")
            }
            spellcheck={false}
            autocomplete="off"
            onInput={(e) => props.onChange?.(e.currentTarget.value)}
          />

          <button
            type="button"
            class="path-input__browse"
            onClick={handleBrowse}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            Browse
          </button>
        </div>
      </div>
    </div>
  );
}
