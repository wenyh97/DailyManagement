#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{process::Command, sync::Mutex};

use serde_json::Value;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow,
    WindowEvent,
};
use tauri_plugin_global_shortcut::ShortcutState;

const DEFAULT_WINDOW_WIDTH: u32 = 460;
const DEFAULT_WINDOW_HEIGHT: u32 = 640;
const DEFAULT_MIN_WIDTH: u32 = 360;
const DEFAULT_MIN_HEIGHT: u32 = 500;
const COLLAPSED_WINDOW_WIDTH: u32 = 72;
const EDGE_TRIGGER_THRESHOLD: i32 = 24;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DockEdge {
    Left,
    Right,
}

#[derive(Clone, Copy, Debug)]
struct DockSnapshot {
    edge: Option<DockEdge>,
    collapsed: bool,
    expanded_width: u32,
    expanded_height: u32,
}

impl Default for DockSnapshot {
    fn default() -> Self {
        Self {
            edge: None,
            collapsed: false,
            expanded_width: DEFAULT_WINDOW_WIDTH,
            expanded_height: DEFAULT_WINDOW_HEIGHT,
        }
    }
}

#[derive(Default)]
struct WindowDockState {
    inner: Mutex<DockSnapshot>,
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "未找到主窗口".to_string())
}

fn lock_dock_state<'a>(
    dock_state: &'a WindowDockState,
) -> Result<std::sync::MutexGuard<'a, DockSnapshot>, String> {
    dock_state
        .inner
        .lock()
        .map_err(|_| "窗口状态繁忙，请稍后重试。".to_string())
}

fn set_min_window_size(window: &WebviewWindow, width: u32, height: u32) -> Result<(), String> {
    window
        .set_min_size(Some(Size::Physical(PhysicalSize::new(width, height))))
        .map_err(|error| error.to_string())
}

fn collapse_window_to_edge(
    window: &WebviewWindow,
    edge: DockEdge,
    dock: &mut DockSnapshot,
) -> Result<(), String> {
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "未找到显示器信息。".to_string())?;

    let monitor_position = monitor.position();
    let monitor_size = monitor.size();

    if size.width > COLLAPSED_WINDOW_WIDTH {
        dock.expanded_width = size.width;
        dock.expanded_height = size.height;
    }

    set_min_window_size(window, COLLAPSED_WINDOW_WIDTH, DEFAULT_MIN_HEIGHT)?;

    let target_x = match edge {
        DockEdge::Left => monitor_position.x,
        DockEdge::Right => monitor_position.x + monitor_size.width as i32 - COLLAPSED_WINDOW_WIDTH as i32,
    };

    window
        .set_size(Size::Physical(PhysicalSize::new(COLLAPSED_WINDOW_WIDTH, size.height)))
        .map_err(|error| error.to_string())?;
    window
        .set_position(Position::Physical(PhysicalPosition::new(target_x, position.y)))
        .map_err(|error| error.to_string())?;

    dock.edge = Some(edge);
    dock.collapsed = true;
    Ok(())
}

fn expand_window_from_edge(
    window: &WebviewWindow,
    edge: DockEdge,
    dock: &mut DockSnapshot,
) -> Result<(), String> {
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "未找到显示器信息。".to_string())?;

    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let target_width = dock.expanded_width.max(DEFAULT_WINDOW_WIDTH);
    let target_height = dock.expanded_height.max(DEFAULT_WINDOW_HEIGHT);

    set_min_window_size(window, DEFAULT_MIN_WIDTH, DEFAULT_MIN_HEIGHT)?;

    let target_x = match edge {
        DockEdge::Left => monitor_position.x,
        DockEdge::Right => monitor_position.x + monitor_size.width as i32 - target_width as i32,
    };

    window
        .set_size(Size::Physical(PhysicalSize::new(target_width, target_height)))
        .map_err(|error| error.to_string())?;
    window
        .set_position(Position::Physical(PhysicalPosition::new(target_x, position.y)))
        .map_err(|error| error.to_string())?;

    dock.collapsed = false;
    Ok(())
}

fn update_window_dock(window: &WebviewWindow, dock_state: &WindowDockState) -> Result<(), String> {
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "未找到显示器信息。".to_string())?;

    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let left_distance = position.x - monitor_position.x;
    let right_distance = monitor_position.x + monitor_size.width as i32 - (position.x + size.width as i32);

    let target_edge = if left_distance <= EDGE_TRIGGER_THRESHOLD {
        Some(DockEdge::Left)
    } else if right_distance <= EDGE_TRIGGER_THRESHOLD {
        Some(DockEdge::Right)
    } else {
        None
    };

    let mut dock = lock_dock_state(dock_state)?;

    match target_edge {
        Some(edge) => {
            dock.edge = Some(edge);
            if !dock.collapsed || size.width > COLLAPSED_WINDOW_WIDTH {
                collapse_window_to_edge(window, edge, &mut dock)?;
            }
        }
        None => {
            if let Some(edge) = dock.edge {
                if dock.collapsed {
                    expand_window_from_edge(window, edge, &mut dock)?;
                }
                dock.edge = None;
                dock.collapsed = false;
                set_min_window_size(window, DEFAULT_MIN_WIDTH, DEFAULT_MIN_HEIGHT)?;
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn get_window_pinned(app: AppHandle) -> Result<bool, String> {
    main_window(&app)?
        .is_always_on_top()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_window_pinned(app: AppHandle, pinned: bool) -> Result<bool, String> {
    let window = main_window(&app)?;

    window
        .set_always_on_top(pinned)
        .map_err(|error| error.to_string())?;

    Ok(pinned)
}

#[tauri::command]
fn handle_window_hover(app: AppHandle, hovering: bool) -> Result<(), String> {
    let window = main_window(&app)?;
    let dock_state = app.state::<WindowDockState>();
    let mut dock = lock_dock_state(&dock_state)?;

    if let Some(edge) = dock.edge {
        if hovering && dock.collapsed {
            expand_window_from_edge(&window, edge, &mut dock)?;
        } else if !hovering && !dock.collapsed {
            collapse_window_to_edge(&window, edge, &mut dock)?;
        }
    }

    Ok(())
}

#[tauri::command]
async fn fetch_update_metadata(candidates: Vec<String>) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let mut errors: Vec<String> = Vec::new();

    for candidate in candidates {
        if candidate.trim().is_empty() {
            continue;
        }

        let response = match client.get(&candidate).send().await {
            Ok(response) => response,
            Err(error) => {
                errors.push(format!("{candidate}：{error}"));
                continue;
            }
        };

        if !response.status().is_success() {
            errors.push(format!("{candidate}：请求失败（{}）", response.status()));
            continue;
        }

        let text = match response.text().await {
            Ok(text) => text,
            Err(error) => {
                errors.push(format!("{candidate}：读取响应失败（{error}）"));
                continue;
            }
        };

        let metadata: Value = match serde_json::from_str(&text) {
            Ok(value) => value,
            Err(error) => {
                errors.push(format!("{candidate}：解析版本信息失败（{error}）"));
                continue;
            }
        };

        if metadata.get("version").is_some() {
            return Ok(metadata);
        }

        errors.push(format!("{candidate}：版本信息格式不完整。"));
    }

    Err(format!(
        "暂时无法获取版本信息。\n{}",
        errors
            .into_iter()
            .next()
            .unwrap_or_else(|| "请检查网络或稍后重试。".to_string())
    ))
}

#[tauri::command]
async fn download_and_install_update(
    app: AppHandle,
    download_url: String,
    version: String,
) -> Result<(), String> {
    let response = reqwest::get(&download_url)
        .await
        .map_err(|error| format!("下载更新失败: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("下载更新失败，状态码: {}", response.status()));
    }

    let installer_bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取更新包失败: {error}"))?;

    let safe_version = version
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '.' || character == '-' {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();

    let installer_path = std::env::temp_dir().join(format!("tonybase-capture-update-{safe_version}.exe"));

    if installer_path.exists() {
        let _ = std::fs::remove_file(&installer_path);
    }

    std::fs::write(&installer_path, installer_bytes.as_ref())
        .map_err(|error| format!("保存更新包失败: {error}"))?;

    Command::new(&installer_path)
        .spawn()
        .map_err(|error| format!("启动安装程序失败: {error}"))?;

    app.exit(0);
    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WindowDockState::default())
        .invoke_handler(tauri::generate_handler![
            get_window_pinned,
            set_window_pinned,
            handle_window_hover,
            fetch_update_metadata,
            download_and_install_update
        ])
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["ctrl+shift+space"])
                .expect("failed to register default shortcut")
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        show_main_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::with_id("capture-tray")
                .menu(&menu)
                .tooltip("TonyBase Capture")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            let app_handle = app.app_handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    match event {
                        WindowEvent::CloseRequested { api, .. } => {
                            api.prevent_close();
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        WindowEvent::Moved(_) => {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let dock_state = app_handle.state::<WindowDockState>();
                                let _ = update_window_dock(&window, &dock_state);
                            }
                        }
                        _ => {}
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}