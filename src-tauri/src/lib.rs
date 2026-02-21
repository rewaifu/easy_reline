use git2::Repository;
use serde::{Deserialize, Serialize};
use std::net::TcpListener;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;
use tokio::fs;

// ─── Stage / Status ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
enum Stage {
    Idle,
    Cloning,
    CreatingVenv,
    Installing,
    Starting,
    Running,
    Error,
}

#[derive(Debug, Serialize, Clone)]
struct StatusEvent {
    stage: Stage,
    message: String,
    port: Option<u16>,
}

fn emit_status(
    app: &tauri::AppHandle,
    stage: Stage,
    message: impl Into<String>,
    port: Option<u16>,
) {
    let _ = app.emit(
        "backend-status",
        StatusEvent {
            stage,
            message: message.into(),
            port,
        },
    );
}

// ─── State ────────────────────────────────────────────────────────────────────

struct BackendProcess(Mutex<Option<CommandChild>>);
struct BackendPort(Mutex<Option<u16>>);

// ─── Paths ────────────────────────────────────────────────────────────────────

fn exe_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("failed to get current exe: {e}"))?;
    exe.parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "failed to get exe parent dir".to_string())
}

fn xdg_data_dir() -> PathBuf {
    let base = std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("/tmp"))
                .join(".local")
                .join("share")
        });
    base.join("easy_reline")
}

fn app_data_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        return exe_dir();
    }

    #[cfg(not(target_os = "windows"))]
    {
        if std::env::var("APPIMAGE").is_ok() {
            return Ok(xdg_data_dir());
        }

        let exe_d = exe_dir()?;
        if is_dir_writable(&exe_d) {
            return Ok(exe_d);
        }

        Ok(xdg_data_dir())
    }
}

fn is_dir_writable(dir: &PathBuf) -> bool {
    let test = dir.join(".write_test_easy_reline");
    match std::fs::File::create(&test) {
        Ok(_) => {
            let _ = std::fs::remove_file(&test);
            true
        }
        Err(_) => false,
    }
}

fn get_workspace_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join("reline_ws"))
}

fn venv_python(workspace: &PathBuf) -> PathBuf {
    if cfg!(windows) {
        workspace.join(".venv").join("Scripts").join("python.exe")
    } else {
        workspace.join(".venv").join("bin").join("python")
    }
}

fn find_free_port(start: u16, end: u16) -> Option<u16> {
    (start..=end).find(|&port| TcpListener::bind(("127.0.0.1", port)).is_ok())
}

const UV_VERSION: &str = "0.10.4";

fn uv_platform() -> Option<(&'static str, &'static str, &'static str)> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    match (os, arch) {
        ("linux", "x86_64") => Some(("linux-x86_64", "uv-x86_64-unknown-linux-gnu.tar.gz", "uv")),
        ("windows", "x86_64") => {
            Some(("windows-x86_64", "uv-x86_64-pc-windows-msvc.zip", "uv.exe"))
        }
        ("macos", "x86_64") => Some(("macos-x86_64", "uv-x86_64-apple-darwin.tar.gz", "uv")),
        ("macos", "aarch64") => Some(("macos-aarch64", "uv-aarch64-apple-darwin.tar.gz", "uv")),
        _ => None,
    }
}

fn uv_in_path() -> Option<PathBuf> {
    which::which("uv").ok()
}

fn uv_local_path(subdir: &str, bin_name: &str) -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join("uv_bin").join(subdir).join(bin_name))
}

async fn find_or_install_uv(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = uv_in_path() {
        emit_status(
            app,
            Stage::Idle,
            format!("Found system uv: {}", path.display()),
            None,
        );
        return Ok(path);
    }

    let (subdir, asset, bin_name) = match uv_platform() {
        Some(p) => p,
        None => {
            let msg = format!(
                "No prebuilt uv for {}/{}, please install uv manually: https://docs.astral.sh/uv/getting-started/installation/",
                std::env::consts::OS, std::env::consts::ARCH
            );
            return Err(msg);
        }
    };

    let local_path = uv_local_path(subdir, bin_name)?;
    if local_path.exists() {
        emit_status(
            app,
            Stage::Idle,
            format!("Found local uv: {}", local_path.display()),
            None,
        );
        ensure_executable(&local_path)?;
        return Ok(local_path);
    }

    emit_status(
        app,
        Stage::Idle,
        format!("uv not found, downloading v{UV_VERSION}..."),
        None,
    );

    let url = format!("https://github.com/astral-sh/uv/releases/download/{UV_VERSION}/{asset}");

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to download uv: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read uv download: {e}"))?;

    emit_status(app, Stage::Idle, "Extracting uv...", None);

    let parent = local_path.parent().unwrap();
    fs::create_dir_all(parent)
        .await
        .map_err(|e| format!("Failed to create uv dir: {e}"))?;

    let local_path_clone = local_path.clone();
    let bin_name_owned = bin_name.to_string();
    let asset_owned = asset.to_string();
    let bytes_vec = bytes.to_vec();

    tokio::task::spawn_blocking(move || {
        if asset_owned.ends_with(".tar.gz") {
            extract_tar_gz(&bytes_vec, &bin_name_owned, &local_path_clone)
        } else if asset_owned.ends_with(".zip") {
            extract_zip(&bytes_vec, &bin_name_owned, &local_path_clone)
        } else {
            Err(format!("Unknown archive format: {asset_owned}"))
        }
    })
    .await
    .map_err(|e| format!("Extract task failed: {e}"))??;

    ensure_executable(&local_path)?;

    emit_status(
        app,
        Stage::Idle,
        format!("uv installed to {}", local_path.display()),
        None,
    );

    Ok(local_path)
}

fn ensure_executable(path: &PathBuf) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
        let mut perms = meta.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(path, perms).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn extract_tar_gz(bytes: &[u8], bin_name: &str, dest: &PathBuf) -> Result<(), String> {
    use flate2::read::GzDecoder;
    use tar::Archive;

    let gz = GzDecoder::new(bytes);
    let mut archive = Archive::new(gz);

    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?;
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        if file_name == bin_name {
            let mut out = std::fs::File::create(dest)
                .map_err(|e| format!("Failed to create {}: {e}", dest.display()))?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    Err(format!("'{bin_name}' not found inside archive"))
}

fn extract_zip(bytes: &[u8], bin_name: &str, dest: &PathBuf) -> Result<(), String> {
    use std::io::{Cursor, Read};
    use zip::ZipArchive;

    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();
        let file_name = PathBuf::from(&name)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        if file_name == bin_name {
            let mut buf = Vec::new();
            file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            std::fs::write(dest, &buf)
                .map_err(|e| format!("Failed to write {}: {e}", dest.display()))?;
            return Ok(());
        }
    }
    Err(format!("'{bin_name}' not found inside zip"))
}

// ─── Config ───────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ConfigReline {
    pub in_dir: String,
    pub out_dir: String,
    pub model_path: String,
    pub model_tile_size: u32,
    pub model_scale: Option<u32>,
    pub model_dtype: String,
    pub model_allow_cpu_scale: bool,
    pub color_fix: bool,
    pub target_size: Option<u32>,
    pub resize_mode: String,
    pub resize_down_format: String,
    pub recursive: bool,
}

fn default_config() -> ConfigReline {
    ConfigReline {
        in_dir: "".into(),
        out_dir: "".into(),
        model_path: "".into(),
        model_tile_size: 512,
        model_scale: None,
        model_dtype: "F32".into(),
        model_allow_cpu_scale: true,
        color_fix: true,
        target_size: None,
        resize_mode: "width".into(),
        resize_down_format: "linear".into(),
        recursive: true,
    }
}

const CONFIG_PATH: &str = "config.json";

#[tauri::command]
async fn open_reline_config() -> ConfigReline {
    let config_path = Path::new(CONFIG_PATH);
    if let Ok(data) = fs::read_to_string(config_path).await {
        if !data.is_empty() {
            if let Ok(cfg) = serde_json::from_str::<ConfigReline>(&data) {
                return cfg;
            }
        }
    }
    let cfg = default_config();
    if let Some(parent) = config_path.parent() {
        let _ = fs::create_dir_all(parent).await;
    }
    let _ = fs::write(config_path, serde_json::to_string_pretty(&cfg).unwrap()).await;
    cfg
}

#[tauri::command]
async fn save_config_reline(config: ConfigReline) -> bool {
    let config_path = Path::new(CONFIG_PATH);
    if let Some(parent) = config_path.parent() {
        let _ = fs::create_dir_all(parent).await;
    }
    fs::write(config_path, serde_json::to_string_pretty(&config).unwrap())
        .await
        .is_ok()
}

// ─── Initialize ───────────────────────────────────────────────────────────────
#[cfg(not(target_os = "windows"))]
fn find_system_python() -> Option<PathBuf> {
    // Ищем python3, который НЕ внутри монтирования AppImage
    for candidate in &["python3", "python"] {
        if let Ok(path) = which::which(candidate) {
            if !path.to_str().unwrap_or("").starts_with("/tmp/.mount_") {
                return Some(path);
            }
        }
    }
    None
}
#[tauri::command]
async fn initialize(
    app: tauri::AppHandle,
    backend_state: tauri::State<'_, BackendProcess>,
    port_state: tauri::State<'_, BackendPort>,
) -> Result<(), String> {
    kill_backend(&backend_state);
    *port_state.0.lock().unwrap() = None;

    emit_status(&app, Stage::Idle, "Detecting platform...", None);

    let uv_path = match find_or_install_uv(&app).await {
        Ok(p) => p,
        Err(e) => {
            emit_status(&app, Stage::Error, format!("uv setup failed: {e}"), None);
            return Err(e);
        }
    };

    let workspace = match get_workspace_path() {
        Ok(p) => p,
        Err(e) => {
            emit_status(&app, Stage::Error, format!("workspace error: {e}"), None);
            return Err(e);
        }
    };

    // ── Clone ─────────────────────────────────────────────────────────────────
    let repo_url = "https://github.com/rewaifu/reline_ws";
    if !workspace.join(".git").exists() {
        emit_status(&app, Stage::Cloning, "Cloning repository...", None);
        if workspace.exists() {
            std::fs::remove_dir_all(&workspace).map_err(|e| e.to_string())?;
        }
        unsafe {
            git2::opts::set_verify_owner_validation(false).unwrap();
        }
        if let Err(e) = Repository::clone(repo_url, &workspace) {
            let msg = format!("Clone failed: {e:?}");
            emit_status(&app, Stage::Error, &msg, None);
            return Err(msg);
        }
        emit_status(&app, Stage::Cloning, "Repository cloned ✓", None);
    } else {
        emit_status(
            &app,
            Stage::Cloning,
            "Repository already exists, skipping clone ✓",
            None,
        );
    }

    // ── venv ──────────────────────────────────────────────────────────────────
    let venv_dir = workspace.join(".venv");
    if venv_dir.exists() {
        emit_status(
            &app,
            Stage::CreatingVenv,
            "Virtual environment already exists, skipping ✓",
            None,
        );
    } else {
        emit_status(
            &app,
            Stage::CreatingVenv,
            "Creating virtual environment...",
            None,
        );
        let mut venv_args = vec!["venv", ".venv"];

        let out = app
            .shell()
            .command(uv_path.to_str().unwrap())
            .args(&venv_args)
            .current_dir(&workspace)
            .output()
            .await
            .map_err(|e| format!("uv venv failed: {e}"))?;
        if !out.status.success() {
            let msg = format!("venv error: {}", String::from_utf8_lossy(&out.stderr));
            emit_status(&app, Stage::Error, &msg, None);
            return Err(msg);
        }
        emit_status(
            &app,
            Stage::CreatingVenv,
            "Virtual environment created ✓",
            None,
        );
    }

    let python_bin = venv_python(&workspace);

    // ── Install deps ──────────────────────────────────────────────────────────
    let uvicorn_check = if cfg!(windows) {
        workspace.join(".venv").join("Scripts").join("uvicorn.exe")
    } else {
        workspace.join(".venv").join("bin").join("uvicorn")
    };

    if uvicorn_check.exists() {
        emit_status(
            &app,
            Stage::Installing,
            "Dependencies already installed, skipping ✓",
            None,
        );
    } else {
        emit_status(&app, Stage::Installing, "Installing dependencies...", None);

        if cfg!(windows) {
            let out = app
                .shell()
                .command(uv_path.to_str().unwrap())
                .args([
                    "pip",
                    "install",
                    "torch",
                    "--index-url",
                    "https://download.pytorch.org/whl/cu128",
                    "--index-strategy",
                    "unsafe-best-match",
                    "--no-cache",
                    "--link-mode=copy",
                ])
                .current_dir(&workspace)
                .output()
                .await
                .map_err(|e| format!("uv pip install failed: {e}"))?;
            if !out.status.success() {
                let msg = format!("install error: {}", String::from_utf8_lossy(&out.stderr));
                emit_status(&app, Stage::Error, &msg, None);
                return Err(msg);
            }
        }

        let out = app
            .shell()
            .command(uv_path.to_str().unwrap())
            .args([
                "pip",
                "install",
                "-e",
                ".",
                "--index-strategy",
                "unsafe-best-match",
                "--no-cache",
                "--link-mode=copy",
            ])
            .current_dir(&workspace)
            .output()
            .await
            .map_err(|e| format!("uv pip install failed: {e}"))?;
        if !out.status.success() {
            let msg = format!("install error: {}", String::from_utf8_lossy(&out.stderr));
            emit_status(&app, Stage::Error, &msg, None);
            return Err(msg);
        }

        emit_status(&app, Stage::Installing, "Dependencies installed ✓", None);
    }

    // ── Port ──────────────────────────────────────────────────────────────────
    let port = match find_free_port(8000, 9000) {
        Some(p) => p,
        None => {
            let msg = "No free port in range 8000-9000".to_string();
            emit_status(&app, Stage::Error, &msg, None);
            return Err(msg);
        }
    };

    emit_status(
        &app,
        Stage::Starting,
        format!("Starting server on port {port}..."),
        None,
    );

    let port_str = port.to_string();
    let (mut rx, child) = app
        .shell()
        .command(python_bin.to_str().unwrap())
        .args([
            "-m",
            "uvicorn",
            "app:app",
            "--host",
            "127.0.0.1",
            "--port",
            &port_str,
        ])
        .current_dir(&workspace)
        .spawn()
        .map_err(|e| {
            let msg = format!("uvicorn spawn failed: {e}");
            emit_status(&app, Stage::Error, &msg, None);
            msg
        })?;

    *backend_state.0.lock().unwrap() = Some(child);
    *port_state.0.lock().unwrap() = Some(port);

    emit_status(
        &app,
        Stage::Running,
        format!("Backend running on ws://127.0.0.1:{port}"),
        Some(port),
    );

    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    println!("[backend] {}", String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    eprintln!("[backend ERR] {}", String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
                    println!("[backend] terminated: {:?}", status.code);
                    emit_status(
                        &app_clone,
                        Stage::Error,
                        "Backend process terminated unexpectedly",
                        None,
                    );
                }
                _ => {}
            }
        }
    });

    Ok(())
}

// ─── Other commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn stop_backend(
    app: tauri::AppHandle,
    backend_state: tauri::State<'_, BackendProcess>,
    port_state: tauri::State<'_, BackendPort>,
) -> Result<(), String> {
    kill_backend(&backend_state);
    *port_state.0.lock().unwrap() = None;
    emit_status(&app, Stage::Idle, "Backend stopped", None);
    Ok(())
}

#[tauri::command]
fn get_backend_port(state: tauri::State<'_, BackendPort>) -> Option<u16> {
    *state.0.lock().unwrap()
}

fn kill_backend(state: &BackendProcess) {
    if let Some(child) = state.0.lock().unwrap().take() {
        let _ = child.kill();
        println!("[backend] killed");
    }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(BackendProcess(Mutex::new(None)));
            app.manage(BackendPort(Mutex::new(None)));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let backend = window.app_handle().state::<BackendProcess>();
                kill_backend(&backend);
            }
        })
        .invoke_handler(tauri::generate_handler![
            initialize,
            stop_backend,
            get_backend_port,
            open_reline_config,
            save_config_reline,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
