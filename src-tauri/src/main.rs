// Hides the console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs, io,
    path::PathBuf,
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WindowEvent,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Closing the main window hides it to the tray (audio keeps playing). Set from the app's settings.
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);
/// "Words in copied Korean" (off by default): watch the clipboard and send Korean text to the main window.
static CLIP_ON: AtomicBool = AtomicBool::new(false);
/// The mini player is placed bottom-right the first time only, so a window the user moved stays put.
static MINI_PLACED: AtomicBool = AtomicBool::new(false);

/// Mini player size (logical px). It grows by VIDEO_H while it shows a YouTube video.
const MINI_W: f64 = 340.0;
const MINI_H: f64 = 268.0;
const VIDEO_H: f64 = 190.0;

/// Global shortcuts (work from any app): Ctrl+Alt+Space play/pause, Ctrl+Alt+P mini player, Ctrl+Alt+K open the app
fn shortcut_list() -> [(Shortcut, &'static str); 3] {
    let m = Some(Modifiers::CONTROL | Modifiers::ALT);
    [(Shortcut::new(m, Code::Space), "Ctrl+Alt+Space"), (Shortcut::new(m, Code::KeyP), "Ctrl+Alt+P"), (Shortcut::new(m, Code::KeyK), "Ctrl+Alt+K")]
}

#[tauri::command]
fn set_shortcuts(app: AppHandle, on: bool) -> Result<(), String> {
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;
    if !on {
        return Ok(());
    }
    // register each one on its own: one taken by another program must not block the others
    let taken: Vec<&str> = shortcut_list().into_iter().filter(|(s, _)| gs.register(*s).is_err()).map(|(_, label)| label).collect();
    if taken.is_empty() {
        Ok(())
    } else {
        Err(format!("{} {} already used by another program", taken.join(" and "), if taken.len() == 1 { "is" } else { "are" }))
    }
}

/// Start with Windows (in the tray, see --minimized). `on: None` only reads the current state.
#[tauri::command]
fn autostart(app: AppHandle, on: Option<bool>) -> Result<bool, String> {
    let a = app.autolaunch();
    match on {
        Some(true) => a.enable().map_err(|e| e.to_string())?,
        Some(false) => a.disable().map_err(|e| e.to_string())?,
        None => {}
    }
    a.is_enabled().map_err(|e| e.to_string())
}

/// Backups go to Documents\Hangul Learner
fn backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().document_dir().map_err(|e| e.to_string())?.join("Hangul Learner");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn export_backup(app: AppHandle, name: String, data: String) -> Result<String, String> {
    if !(name.ends_with(".json") || name.ends_with(".csv")) || !name.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c)) {
        return Err("bad file name".into());
    }
    let path = backup_dir(&app)?.join(name);
    fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Automatic backups: keeps the newest `keep` files named <prefix>…json in the backup folder and deletes older ones
/// (names carry the date, so name order is age order).
#[tauri::command]
fn prune_backups(app: AppHandle, prefix: String, keep: usize) -> Result<usize, String> {
    if prefix.is_empty() || !prefix.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("bad prefix".into());
    }
    let mut files: Vec<PathBuf> = fs::read_dir(backup_dir(&app)?)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with(&prefix) && n.ends_with(".json")))
        .collect();
    files.sort();
    let old = files.len().saturating_sub(keep);
    for p in &files[..old] {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(old)
}

/// Opens Explorer with the backup file selected (only files inside the backup folder).
#[tauri::command]
fn show_in_folder(app: AppHandle, path: String) -> Result<(), String> {
    let dir = backup_dir(&app)?.canonicalize().map_err(|e| e.to_string())?;
    let file = PathBuf::from(&path).canonicalize().map_err(|e| e.to_string())?;
    if !file.starts_with(&dir) {
        return Err("not a backup file".into());
    }
    let shown = file.to_string_lossy().trim_start_matches(r"\\?\").to_string();
    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("explorer.exe");
        c.arg(format!("/select,{shown}"));
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.args(["-R", &shown]);
        c
    };
    #[cfg(all(not(windows), not(target_os = "macos")))]
    let mut cmd = {
        let _ = &shown;
        let mut c = Command::new("xdg-open"); // Linux file managers can't select a file: open its folder
        c.arg(&dir);
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Opens a link in the default browser: explorer.exe on Windows, open on macOS, xdg-open on Linux.
fn open_with_system(target: &str) -> Result<(), String> {
    let opener = if cfg!(windows) { "explorer.exe" } else if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    Command::new(opener).arg(target).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// %APPDATA%\com.hangul.learner\progress.json
fn progress_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("progress.json"))
}

#[tauri::command]
fn load_progress(app: AppHandle) -> Result<String, String> {
    match fs::read_to_string(progress_path(&app)?) {
        Ok(json) => Ok(json),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok("{}".into()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_progress(app: AppHandle, data: String) -> Result<(), String> {
    // Write to a temp file then rename, so a crash mid-save can't corrupt existing progress.
    let path = progress_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

fn https_only(url: &str) -> Result<(), String> {
    if url.starts_with("https://") && !url.contains(|c: char| c.is_whitespace() || c == '"') {
        Ok(())
    } else {
        Err("only https links are allowed".into())
    }
}

/// Downloads a podcast / YouTube feed. Uses Windows' built-in curl.exe (no CORS limits, no extra crates).
/// --compressed: feeds are large XML; gzip makes them ~9x smaller, which matters on slow connections.
#[tauri::command(async)]
fn fetch_text(url: String) -> Result<String, String> {
    https_only(&url)?;
    let mut cmd = Command::new(if cfg!(windows) { "curl.exe" } else { "curl" }); // built into Windows 10+, macOS and Linux
    cmd.args(["-sSL", "--fail", "--compressed", "--max-time", "60", "--max-filesize", "40000000", "-A", "Mozilla/5.0 HangulLearner", &url]);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console flash
    let out = cmd.output().map_err(|e| format!("curl: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Opens a link (e.g. a YouTube video that can't be embedded) in the default browser.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    https_only(&url)?;
    open_with_system(&url)
}

#[tauri::command]
fn clip_watch(on: bool) {
    CLIP_ON.store(on, Ordering::Relaxed);
}

/// Wakes the page after `ms` (focus timer). Page timers are slowed while the window is hidden; this thread is not.
/// Stale alarms are harmless: the page checks the real end time.
#[tauri::command]
fn alarm(app: AppHandle, ms: u64) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(ms.min(4 * 3600 * 1000)));
        let _ = app.emit_to("main", "alarm", ());
    });
}

/// Pronunciation check: Windows speech recognition listens once and returns which of `phrases` it heard ("" = nothing
/// clear). The first phrase is the word being practised; the others are similar words, so a wrong sound doesn't match it.
/// Needs Windows' Korean speech pack; without it the error is "NO_KOREAN".
#[tauri::command]
async fn recognize(phrases: Vec<String>) -> Result<String, String> {
    if phrases.is_empty() || phrases.len() > 20 || phrases.iter().any(|p| p.trim().is_empty() || p.chars().count() > 40) {
        return Err("bad phrases".into());
    }
    #[cfg(windows)]
    return tauri::async_runtime::spawn_blocking(move || speech::recognize(phrases))
        .await
        .map_err(|e| e.to_string())?;
    #[cfg(not(windows))]
    Err("NO_KOREAN".into())
}

#[cfg(windows)]
mod speech {
    use windows::{
        core::HSTRING,
        Foundation::TimeSpan,
        Globalization::Language,
        Media::SpeechRecognition::*,
        Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED},
    };

    fn e(err: windows::core::Error) -> String {
        err.message().to_string()
    }

    pub fn recognize(phrases: Vec<String>) -> Result<String, String> {
        let _ = unsafe { RoInitialize(RO_INIT_MULTITHREADED) }; // already initialised is fine
        let korean = SpeechRecognizer::SupportedGrammarLanguages()
            .map_err(e)?
            .into_iter()
            .any(|l| l.LanguageTag().map(|t| t.to_string().starts_with("ko")).unwrap_or(false));
        if !korean {
            return Err("NO_KOREAN".into());
        }
        let rec = SpeechRecognizer::Create(&Language::CreateLanguage(&HSTRING::from("ko-KR")).map_err(e)?).map_err(e)?;
        let list: windows_collections::IIterable<HSTRING> = phrases.iter().map(HSTRING::from).collect::<Vec<_>>().into();
        rec.Constraints().map_err(e)?.Append(&SpeechRecognitionListConstraint::Create(&list).map_err(e)?).map_err(e)?;
        if rec.CompileConstraintsAsync().map_err(e)?.join().map_err(e)?.Status().map_err(e)? != SpeechRecognitionResultStatus::Success {
            return Err("NO_KOREAN".into());
        }
        let t = rec.Timeouts().map_err(e)?;
        t.SetInitialSilenceTimeout(TimeSpan { Duration: 50_000_000 }).map_err(e)?; // 5 s to start speaking
        t.SetEndSilenceTimeout(TimeSpan { Duration: 8_000_000 }).map_err(e)?; // 0.8 s of quiet ends it
        let r = rec.RecognizeAsync().map_err(e)?.join().map_err(e)?;
        let status = r.Status().map_err(e)?;
        if status == SpeechRecognitionResultStatus::MicrophoneUnavailable {
            return Err("No microphone found".into());
        }
        if status != SpeechRecognitionResultStatus::Success || r.Confidence().map_err(e)? == SpeechRecognitionConfidence::Rejected {
            return Ok(String::new());
        }
        Ok(r.Text().map_err(e)?.to_string())
    }
}

/// Progress sync: <folder>\Hangul Learner\progress.json inside a folder OneDrive / Google Drive already syncs.
fn sync_file(dir: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(dir.trim());
    if !root.is_absolute() || !root.is_dir() {
        return Err("That folder does not exist".into());
    }
    Ok(root.join("Hangul Learner").join("progress.json"))
}

/// The OneDrive folder, if OneDrive is set up on this PC ("" otherwise).
#[tauri::command]
fn sync_default() -> String {
    ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"]
        .iter()
        .filter_map(|k| std::env::var(k).ok())
        .find(|p| PathBuf::from(p).is_dir())
        .unwrap_or_default()
}

#[tauri::command]
fn sync_read(dir: String) -> Result<String, String> {
    match fs::read_to_string(sync_file(&dir)?) {
        Ok(json) => Ok(json),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn sync_write(dir: String, data: String) -> Result<(), String> {
    let path = sync_file(&dir)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    /// Changes every time anything is copied; reading it does not open (or lock) the clipboard.
    fn GetClipboardSequenceNumber() -> u32;
}

/// Checks the clipboard's change counter twice a second and reads the text only after a new copy while the
/// setting is on. Text with Hangul goes to the main window, which only matches it against the word list.
#[cfg(windows)]
fn watch_clipboard(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = unsafe { GetClipboardSequenceNumber() }; // what was copied before the app started is ignored
        let mut board: Option<arboard::Clipboard> = None;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let seq = unsafe { GetClipboardSequenceNumber() };
            if seq == last {
                continue;
            }
            last = seq;
            if !CLIP_ON.load(Ordering::Relaxed) {
                continue;
            }
            if board.is_none() {
                board = arboard::Clipboard::new().ok();
            }
            let Some(b) = board.as_mut() else { continue };
            if let Ok(text) = b.get_text() {
                if text.len() <= 20_000 && text.chars().any(|c| ('가'..='힣').contains(&c)) {
                    let _ = app.emit_to("main", "clip", text);
                }
            }
        }
    });
}

/// macOS / Linux have no change counter, so while the setting is on the text is read once a second and compared.
/// Whatever was on the clipboard when the setting turned on is ignored.
#[cfg(not(windows))]
fn watch_clipboard(app: AppHandle) {
    std::thread::spawn(move || {
        let mut board: Option<arboard::Clipboard> = None;
        let mut last: Option<String> = None;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(1000));
            if !CLIP_ON.load(Ordering::Relaxed) {
                last = None;
                continue;
            }
            if board.is_none() {
                board = arboard::Clipboard::new().ok();
            }
            let Some(b) = board.as_mut() else { continue };
            let Ok(text) = b.get_text() else { continue };
            if last.as_deref() == Some(text.as_str()) {
                continue;
            }
            let first = last.is_none();
            last = Some(text.clone());
            if !first && text.len() <= 20_000 && text.chars().any(|c| ('가'..='힣').contains(&c)) {
                let _ = app.emit_to("main", "clip", text);
            }
        }
    });
}

#[tauri::command]
fn close_to_tray(on: bool) {
    CLOSE_TO_TRAY.store(on, Ordering::Relaxed);
}

#[tauri::command]
fn toggle_mini(app: AppHandle) {
    toggle_mini_window(&app)
}

#[tauri::command]
fn hide_mini(app: AppHandle) {
    hide_mini_window(&app)
}

/// Grows (on) or shrinks the mini player for the video panel, keeping its bottom edge in place.
#[tauri::command]
fn mini_video(app: AppHandle, on: bool) {
    let Some(w) = app.get_webview_window("mini") else { return };
    let (Ok(pos), Ok(old), Ok(scale)) = (w.outer_position(), w.outer_size(), w.scale_factor()) else { return };
    let h = if on { MINI_H + VIDEO_H } else { MINI_H };
    let _ = w.set_size(LogicalSize::new(MINI_W, h));
    let new_h = (h * scale).round() as i32;
    let _ = w.set_position(PhysicalPosition::new(pos.x, pos.y + old.height as i32 - new_h));
}

/// True while the mini player is on screen (events about it can arrive a moment late).
#[tauri::command]
fn mini_visible(app: AppHandle) -> bool {
    app.get_webview_window("mini").and_then(|w| w.is_visible().ok()).unwrap_or(false)
}

/// Hides the mini player and tells the pages, so a video playing there can move back to the main window.
fn hide_mini_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("mini") {
        let _ = w.hide();
        let _ = app.emit("mini-hidden", ());
    }
}

#[tauri::command]
fn show_main(app: AppHandle) {
    show_main_window(&app)
}

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn toggle_mini_window(app: &AppHandle) {
    let Some(w) = app.get_webview_window("mini") else { return };
    if w.is_visible().unwrap_or(false) {
        hide_mini_window(app);
        return;
    }
    if !MINI_PLACED.swap(true, Ordering::Relaxed) {
        // bottom-right corner of the screen, above the taskbar
        let monitor = w.current_monitor().ok().flatten().or_else(|| w.primary_monitor().ok().flatten());
        if let (Some(m), Ok(size)) = (monitor, w.outer_size()) {
            let area = m.work_area();
            let x = area.position.x + area.size.width as i32 - size.width as i32 - 20;
            let y = area.position.y + area.size.height as i32 - size.height as i32 - 20;
            let _ = w.set_position(PhysicalPosition::new(x, y));
        }
    }
    let _ = w.show();
    let _ = app.emit("mini-shown", ());
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let [play, mini, open] = shortcut_list().map(|(s, _)| s);
                    if shortcut == &play {
                        let _ = app.emit("player-cmd", "toggle");
                    } else if shortcut == &mini {
                        toggle_mini_window(app);
                    } else if shortcut == &open {
                        show_main_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            // Started with Windows: stay in the tray. Otherwise show the window (it starts hidden to avoid a flash).
            if !std::env::args().any(|a| a == "--minimized") {
                show_main_window(app.handle());
            }
            let open = MenuItem::with_id(app, "open", "Open Hangul Learner", true, None::<&str>)?;
            let mini = MenuItem::with_id(app, "mini", "Mini player", true, None::<&str>)?;
            let play = MenuItem::with_id(app, "play", "Play / pause", true, None::<&str>)?;
            let focus = MenuItem::with_id(app, "focus", "Focus timer", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &mini, &play, &focus, &sep, &quit])?;
            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .tooltip("Hangul Learner")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "open" => show_main_window(app),
                    "mini" => toggle_mini_window(app),
                    "play" => {
                        let _ = app.emit("player-cmd", "toggle");
                    }
                    "focus" => {
                        let _ = app.emit("player-cmd", "focus");
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;
            watch_clipboard(app.handle().clone());
            Ok(())
        })
        .on_window_event(|w, e| {
            if let WindowEvent::CloseRequested { api, .. } = e {
                if w.label() == "mini" {
                    api.prevent_close();
                    hide_mini_window(w.app_handle());
                } else if CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = w.hide();
                } else {
                    w.app_handle().exit(0); // the hidden mini window would otherwise keep the app alive
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_progress, save_progress, fetch_text, open_external, close_to_tray, toggle_mini, hide_mini, show_main, mini_video, mini_visible,
            set_shortcuts, autostart, export_backup, show_in_folder, clip_watch, alarm, sync_default, sync_read, sync_write, recognize, prune_backups
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Hangul Learner");
}
