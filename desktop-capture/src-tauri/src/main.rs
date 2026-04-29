#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;

use serde_json::Value;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WebviewWindow, WindowEvent};
use tauri_plugin_global_shortcut::ShortcutState;

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "未找到主窗口".to_string())
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
        .invoke_handler(tauri::generate_handler![
            get_window_pinned,
            set_window_pinned,
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