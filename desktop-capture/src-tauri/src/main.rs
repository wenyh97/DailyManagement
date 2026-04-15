#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_global_shortcut::ShortcutState;

#[tauri::command]
fn get_window_pinned(app: AppHandle) -> Result<bool, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "未找到主窗口".to_string())?
        .is_always_on_top()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_window_pinned(app: AppHandle, pinned: bool) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "未找到主窗口".to_string())?;

    window
        .set_always_on_top(pinned)
        .map_err(|error| error.to_string())?;

    Ok(pinned)
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

    let installer_path = std::env::temp_dir()
        .join(format!("tonybase-capture-update-{safe_version}.exe"));

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
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.hide();
                        }
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
