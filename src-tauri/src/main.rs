//! The Rust side of Hangul Learner: everything the web page in `ui/` cannot do on its own.
//!
//! The page calls the `#[tauri::command]` functions below by name with `invoke('name', {args})`, so command
//! names and argument names must not change. The Rust side talks back with events (`alarm`, `clip`,
//! `player-cmd`, `mini-shown`, `mini-hidden`).
//!
//! Sections, in order:
//! 1. App-wide switches set from the settings page (close to tray, clipboard watching, mini placement).
//! 2. Global shortcuts and start-with-the-system.
//! 3. Progress file: `<app data>/progress.json`.
//! 4. Cloud-folder sync: `<cloud folder>/Hangul Learner/progress.json`, and finding a default cloud folder.
//! 5. Backups: `Documents/Hangul Learner`, pruning old automatic backups, showing a backup in the file manager.
//! 6. Web: https-only checks, feeds with curl, opening links in the browser.
//! 7. Offline episodes: downloads with curl (progress, cancel), deleting them, their total size.
//! 8. Focus-timer alarm.
//! 9. Pronunciation check with Windows speech recognition (module `speech`).
//! 10. "Words in copied Korean": watching the clipboard.
//! 11. Windows: the main window, the always-on-top mini player and its saved position.
//! 12. Tray icon and menu.
//! 13. `main`: plugins (single instance, notifications, updater, autostart, shortcuts), setup and the command list.

// Hides the console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs, io,
    path::{Path, PathBuf},
    process::{Child, Command, ExitStatus, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
    Window, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

// ---------------------------------------------------------------------------------------------------------------
// 1. App-wide switches
// ---------------------------------------------------------------------------------------------------------------

/// Closing the main window hides it to the tray (audio keeps playing). Set from the app's settings.
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);
/// "Words in copied Korean" (off by default): watch the clipboard and send Korean text to the main window.
static CLIP_ON: AtomicBool = AtomicBool::new(false);
/// The mini player is placed the first time it opens only, so a window the user moved stays put.
static MINI_PLACED: AtomicBool = AtomicBool::new(false);

/// Hides the main window to the tray on close (`on: true`) or quits the app on close (`on: false`).
/// Called by the settings page when the "close to tray" switch changes. Returns nothing.
#[tauri::command]
fn close_to_tray(on: bool) {
    CLOSE_TO_TRAY.store(on, Ordering::Relaxed);
}

/// Turns "Words in copied Korean" on or off: while `on`, Korean text the user copies anywhere is sent to the
/// main window as a `clip` event (see section 10). Returns nothing.
#[tauri::command]
fn clip_watch(on: bool) {
    CLIP_ON.store(on, Ordering::Relaxed);
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Global shortcuts and start with the system
// ---------------------------------------------------------------------------------------------------------------

/// Global shortcuts (work from any app): Ctrl+Alt+Space play/pause, Ctrl+Alt+P mini player, Ctrl+Alt+K open the
/// app. Each comes with the label shown to the user if another program already uses it.
fn shortcut_list() -> [(Shortcut, &'static str); 3] {
    let ctrl_alt = Some(Modifiers::CONTROL | Modifiers::ALT);
    [
        (Shortcut::new(ctrl_alt, Code::Space), "Ctrl+Alt+Space"),
        (Shortcut::new(ctrl_alt, Code::KeyP), "Ctrl+Alt+P"),
        (Shortcut::new(ctrl_alt, Code::KeyK), "Ctrl+Alt+K"),
    ]
}

/// Turns the global shortcuts on (`on: true`) or off. Used by the settings page.
/// Returns an error naming the shortcuts another program already holds; the others still work.
#[tauri::command]
fn set_shortcuts(app: AppHandle, on: bool) -> Result<(), String> {
    let global_shortcuts = app.global_shortcut();
    global_shortcuts
        .unregister_all()
        .map_err(|e| e.to_string())?;
    if !on {
        return Ok(());
    }
    // register each one on its own: one taken by another program must not block the others
    let taken: Vec<&str> = shortcut_list()
        .into_iter()
        .filter(|(shortcut, _)| global_shortcuts.register(*shortcut).is_err())
        .map(|(_, label)| label)
        .collect();
    if taken.is_empty() {
        return Ok(());
    }
    let verb = if taken.len() == 1 { "is" } else { "are" };
    Err(format!(
        "{} {} already used by another program",
        taken.join(" and "),
        verb
    ))
}

/// Runs a global shortcut: play/pause goes to the page as `player-cmd` "toggle"; the others act on windows.
fn on_global_shortcut(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state() != ShortcutState::Pressed {
        return;
    }
    let [play_pause, mini_player, open_app] = shortcut_list().map(|(shortcut, _)| shortcut);
    if shortcut == &play_pause {
        let _ = app.emit("player-cmd", "toggle");
    } else if shortcut == &mini_player {
        toggle_mini_window(app);
    } else if shortcut == &open_app {
        show_main_window(app);
    }
}

/// Start with the system (in the tray, see `--minimized` in `main`). The settings page calls it with
/// `on: true`/`false` to change it, or `on: null` only to read the current state.
/// Returns whether the app now starts with the system.
#[tauri::command]
fn autostart(app: AppHandle, on: Option<bool>) -> Result<bool, String> {
    let autolaunch = app.autolaunch();
    match on {
        Some(true) => autolaunch.enable().map_err(|e| e.to_string())?,
        Some(false) => autolaunch.disable().map_err(|e| e.to_string())?,
        None => {}
    }
    autolaunch.is_enabled().map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Progress file
// ---------------------------------------------------------------------------------------------------------------

/// `<app data>/progress.json` (on Windows `%APPDATA%\com.hangul.learner\progress.json`). Creates the folder.
fn progress_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("progress.json"))
}

/// Reads a text file, or returns `when_missing` if it doesn't exist yet.
fn read_text_or(path: &Path, when_missing: &str) -> Result<String, String> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(text),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(when_missing.into()),
        Err(e) => Err(e.to_string()),
    }
}

/// Writes to `<name>.json.tmp` and then renames it over the file, so a crash mid-save can't corrupt the old one.
fn write_json_atomically(path: &Path, data: String) -> Result<(), String> {
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, data).map_err(|e| e.to_string())?;
    fs::rename(&temp_path, path).map_err(|e| e.to_string())
}

/// Loads the learner's progress when the app starts. Returns the saved JSON text, or `"{}"` on first run.
#[tauri::command]
fn load_progress(app: AppHandle) -> Result<String, String> {
    read_text_or(&progress_path(&app)?, "{}")
}

/// Saves the learner's progress. `data` is the whole progress as JSON text. Returns nothing.
#[tauri::command]
fn save_progress(app: AppHandle, data: String) -> Result<(), String> {
    write_json_atomically(&progress_path(&app)?, data)
}

// ---------------------------------------------------------------------------------------------------------------
// 4. Cloud-folder sync
// ---------------------------------------------------------------------------------------------------------------

/// Progress sync: `<folder>\Hangul Learner\progress.json` inside a folder OneDrive / Google Drive already syncs.
/// `dir` must be an existing absolute folder.
fn sync_file(dir: &str) -> Result<PathBuf, String> {
    let cloud_folder = PathBuf::from(dir.trim());
    if !cloud_folder.is_absolute() || !cloud_folder.is_dir() {
        return Err("That folder does not exist".into());
    }
    Ok(cloud_folder.join("Hangul Learner").join("progress.json"))
}

/// Cloud folders other than OneDrive, in the home folder: iCloud Drive (Mac), Google Drive (Mac's
/// `Library/CloudStorage/GoogleDrive-*` or the older `Google Drive` folder) and Dropbox. They may not exist.
fn home_cloud_folders(home: &Path) -> Vec<PathBuf> {
    let mut folders = vec![home.join("Library/Mobile Documents/com~apple~CloudDocs")];
    if let Ok(entries) = fs::read_dir(home.join("Library/CloudStorage")) {
        folders.extend(
            entries
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| {
                    path.file_name()
                        .and_then(|name| name.to_str())
                        .is_some_and(|name| name.starts_with("GoogleDrive-"))
                })
                .map(|path| path.join("My Drive")),
        );
    }
    folders
        .extend(["Google Drive/My Drive", "Google Drive", "Dropbox"].map(|name| home.join(name)));
    folders
}

/// Suggests a sync folder for the settings page: OneDrive (Windows), else iCloud Drive (Mac), Google Drive or
/// Dropbox in the home folder. Returns the first one that exists, or `""` if none does.
#[tauri::command]
fn sync_default() -> String {
    let onedrive_folders = ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"]
        .iter()
        .filter_map(|variable| std::env::var(variable).ok())
        .map(PathBuf::from);
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .ok();
    let other_folders = home
        .map(|home| home_cloud_folders(&home))
        .unwrap_or_default();
    onedrive_folders
        .chain(other_folders)
        .find(|folder| folder.is_dir())
        .map(|folder| folder.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Reads the synced progress from the cloud folder `dir`. Returns its JSON text, or `""` if nothing was synced yet.
#[tauri::command]
fn sync_read(dir: String) -> Result<String, String> {
    read_text_or(&sync_file(&dir)?, "")
}

/// Writes the progress `data` (JSON text) to the cloud folder `dir`, creating `Hangul Learner` in it if needed.
/// Returns nothing.
#[tauri::command]
fn sync_write(dir: String, data: String) -> Result<(), String> {
    let path = sync_file(&dir)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    write_json_atomically(&path, data)
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Backups
// ---------------------------------------------------------------------------------------------------------------

/// Backups go to `Documents\Hangul Learner`. Creates the folder.
fn backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("Hangul Learner");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// A backup name is a plain `.json` or `.csv` file name: letters, digits, `-`, `_` and `.` only, so it can't
/// point outside the backup folder.
fn is_safe_backup_name(name: &str) -> bool {
    let allowed_extension = name.ends_with(".json") || name.ends_with(".csv");
    let allowed_characters = name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c));
    allowed_extension && allowed_characters
}

/// Saves a backup or export file (progress JSON, word list CSV, automatic backups) in the backup folder.
/// `name` is the file name, `data` its contents. Returns the full path of the saved file.
#[tauri::command]
fn export_backup(app: AppHandle, name: String, data: String) -> Result<String, String> {
    if !is_safe_backup_name(&name) {
        return Err("bad file name".into());
    }
    let path = backup_dir(&app)?.join(name);
    fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Automatic backups: keeps the newest `keep` files named `<prefix>…json` in the backup folder and deletes older
/// ones (names carry the date, so name order is age order). `prefix` is letters, digits and `-` only.
/// Returns how many files were deleted.
#[tauri::command]
fn prune_backups(app: AppHandle, prefix: String, keep: usize) -> Result<usize, String> {
    let prefix_is_safe = !prefix.is_empty()
        && prefix
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !prefix_is_safe {
        return Err("bad prefix".into());
    }
    let mut backups: Vec<PathBuf> = fs::read_dir(backup_dir(&app)?)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(&prefix) && name.ends_with(".json"))
        })
        .collect();
    backups.sort();
    let delete_count = backups.len().saturating_sub(keep);
    for old_backup in &backups[..delete_count] {
        fs::remove_file(old_backup).map_err(|e| e.to_string())?;
    }
    Ok(delete_count)
}

/// Resolves `path` and checks it is inside `dir` (also resolved), so the page can only touch files there.
/// Returns the resolved path, or `refusal` as the error.
fn canonical_path_inside(dir: &Path, path: &str, refusal: &str) -> Result<PathBuf, String> {
    let file = PathBuf::from(path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !file.starts_with(dir) {
        return Err(refusal.into());
    }
    Ok(file)
}

/// Shows a saved backup in the file manager (the "Show in folder" button after an export). `path` must be a file
/// inside the backup folder. Explorer and Finder select the file; Linux file managers open its folder.
/// Returns nothing.
#[tauri::command]
fn show_in_folder(app: AppHandle, path: String) -> Result<(), String> {
    let dir = backup_dir(&app)?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let file = canonical_path_inside(&dir, &path, "not a backup file")?;
    // canonicalize() on Windows adds the \\?\ prefix, which Explorer doesn't understand
    let shown = file
        .to_string_lossy()
        .trim_start_matches(r"\\?\")
        .to_string();
    #[cfg(windows)]
    let mut command = {
        let mut explorer = Command::new("explorer.exe");
        explorer.arg(format!("/select,{shown}"));
        explorer
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut open = Command::new("open");
        open.args(["-R", &shown]);
        open
    };
    #[cfg(all(not(windows), not(target_os = "macos")))]
    let mut command = {
        let _ = &shown;
        let mut xdg_open = Command::new("xdg-open"); // Linux file managers can't select a file: open its folder
        xdg_open.arg(&dir);
        xdg_open
    };
    command.spawn().map(|_| ()).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------------------------------------------
// 6. Web: https-only links, feeds, the browser
// ---------------------------------------------------------------------------------------------------------------

/// Sent with every request; some podcast hosts refuse requests without a browser-like user agent.
const USER_AGENT: &str = "Mozilla/5.0 HangulLearner";

/// CREATE_NO_WINDOW: starting curl from the app must not flash a console window on Windows.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Only `https://` links without spaces or quotes are fetched or opened.
fn https_only(url: &str) -> Result<(), String> {
    if url.starts_with("https://") && !url.contains(|c: char| c.is_whitespace() || c == '"') {
        Ok(())
    } else {
        Err("only https links are allowed".into())
    }
}

/// The system's curl (built into Windows 10+, macOS and Linux), set to fail on HTTP errors and to use https only,
/// for the first request and for every redirect. Callers add limits, the user agent and the URL.
fn https_curl() -> Command {
    let mut curl = Command::new(if cfg!(windows) { "curl.exe" } else { "curl" });
    curl.args([
        "-sSL",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--fail",
    ]);
    #[cfg(windows)]
    curl.creation_flags(CREATE_NO_WINDOW);
    curl
}

/// Downloads a podcast / YouTube feed for the Listen page (curl has no CORS limits and needs no extra crates).
/// `url` must be https. Returns the response body as text, or curl's error message.
#[tauri::command(async)]
fn fetch_text(url: String) -> Result<String, String> {
    https_only(&url)?;
    let mut curl = https_curl();
    // --compressed: feeds are large XML; gzip makes them ~9x smaller, which matters on slow connections.
    curl.args([
        "--compressed",
        "--max-time",
        "60",
        "--max-filesize",
        "40000000",
        "-A",
        USER_AGENT,
        &url,
    ]);
    let output = curl.output().map_err(|e| format!("curl: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Opens `url` in the default browser (e.g. a YouTube video that can't be embedded, or the changelog).
/// `url` must be https. Returns nothing.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    https_only(&url)?;
    open_with_system(&url)
}

/// Opens a link in the default browser: explorer.exe on Windows, open on macOS, xdg-open on Linux.
fn open_with_system(target: &str) -> Result<(), String> {
    let opener = if cfg!(windows) {
        "explorer.exe"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    Command::new(opener)
        .arg(target)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------------------------------------------
// 7. Offline episodes
// ---------------------------------------------------------------------------------------------------------------

/// Offline podcasts live in `<app data>/episodes`; the page plays them through the asset protocol, whose scope in
/// tauri.conf.json is that folder. Creates the folder.
fn episodes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("episodes");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// An episode's file in the episodes folder, named by the 64-bit FNV-1a hash of its URL: `<16 hex digits>.mp3`.
/// While downloading it is `<same name>.part`. Changing the hash would lose every downloaded episode.
fn episode_path(app: &AppHandle, url: &str) -> Result<PathBuf, String> {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in url.bytes() {
        hash = (hash ^ byte as u64).wrapping_mul(0x100_0000_01b3);
    }
    Ok(episodes_dir(app)?.join(format!("{hash:016x}.mp3")))
}

/// URLs whose download should stop (Cancel on the Listen page).
static CANCELLED: Mutex<Vec<String>> = Mutex::new(Vec::new());

fn is_cancelled(url: &str) -> bool {
    CANCELLED
        .lock()
        .unwrap()
        .iter()
        .any(|cancelled| cancelled == url)
}

/// Downloads an episode for offline listening with the system's curl (https only, at most 30 minutes and 400 MB).
/// `url` is the episode's audio link. While it runs, `download_progress` tells how far it is and
/// `cancel_download` stops it (the error is then "cancelled"). Returns the path of the downloaded `.mp3` file.
#[tauri::command]
async fn download_episode(app: AppHandle, url: String) -> Result<String, String> {
    https_only(&url)?;
    let path = episode_path(&app, &url)?;
    let part_path = path.with_extension("part");
    CANCELLED
        .lock()
        .unwrap()
        .retain(|cancelled| cancelled != &url);
    tauri::async_runtime::spawn_blocking(move || {
        let mut curl = https_curl();
        curl.args([
            "--max-time",
            "1800",
            "--max-filesize",
            "400000000",
            "-A",
            USER_AGENT,
            "-o",
        ]);
        curl.arg(&part_path)
            .arg(&url)
            .stderr(Stdio::piped())
            .stdout(Stdio::null());
        let mut child = curl.spawn().map_err(|e| format!("curl: {e}"))?;
        let status = wait_unless_cancelled(&mut child, &url, &part_path)?;
        if !status.success() {
            let message = read_stderr(&mut child);
            let _ = fs::remove_file(&part_path);
            return Err(message.trim().to_string());
        }
        // only a complete download gets the .mp3 name, so a half file is never played
        fs::rename(&part_path, &path).map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Waits for curl to finish, checking five times a second whether the download was cancelled. On cancel it stops
/// curl, deletes the partial file and returns the error "cancelled".
fn wait_unless_cancelled(
    child: &mut Child,
    url: &str,
    part_path: &Path,
) -> Result<ExitStatus, String> {
    loop {
        if is_cancelled(url) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = fs::remove_file(part_path);
            return Err("cancelled".into());
        }
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => return Ok(status),
            None => std::thread::sleep(Duration::from_millis(200)),
        }
    }
}

/// What curl wrote to stderr (its error message), or "" if it can't be read.
fn read_stderr(child: &mut Child) -> String {
    let mut message = String::new();
    if let Some(mut stderr) = child.stderr.take() {
        let _ = io::Read::read_to_string(&mut stderr, &mut message);
    }
    message
}

/// Polled by the Listen page while `url` downloads. Returns the bytes downloaded so far (0 if it isn't downloading).
#[tauri::command]
fn download_progress(app: AppHandle, url: String) -> u64 {
    episode_path(&app, &url)
        .ok()
        .and_then(|path| fs::metadata(path.with_extension("part")).ok())
        .map_or(0, |metadata| metadata.len())
}

/// Stops the download of `url` (the Cancel button on the Listen page). Returns nothing; `download_episode` then
/// fails with "cancelled".
#[tauri::command]
fn cancel_download(url: String) {
    CANCELLED.lock().unwrap().push(url);
}

/// Deletes one downloaded episode (`path` as returned by `download_episode`), or every file in the episodes folder
/// when `path` is empty (the "delete downloads" button in settings). Only files in the episodes folder.
/// Returns nothing.
#[tauri::command]
fn delete_episodes(app: AppHandle, path: String) -> Result<(), String> {
    let dir = episodes_dir(&app)?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if path.is_empty() {
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
            let _ = fs::remove_file(entry.path());
        }
        return Ok(());
    }
    let file = canonical_path_inside(&dir, &path, "not a downloaded episode")?;
    fs::remove_file(file).map_err(|e| e.to_string())
}

/// Deletes `.part` files older than two hours: they were left by a download that never finished.
fn remove_stale_partial_downloads(dir: &Path) -> Result<(), String> {
    const TWO_HOURS_SECS: u64 = 7200;
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let is_old = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|modified| modified.elapsed().ok())
            .is_some_and(|age| age.as_secs() > TWO_HOURS_SECS);
        if is_old && entry.path().extension().is_some_and(|ext| ext == "part") {
            let _ = fs::remove_file(entry.path());
        }
    }
    Ok(())
}

/// For the downloads line in settings; also clears out abandoned partial downloads.
/// Returns `[number of downloaded episodes, their total size in bytes]`.
#[tauri::command]
fn episodes_size(app: AppHandle) -> Result<(usize, u64), String> {
    let dir = episodes_dir(&app)?;
    remove_stale_partial_downloads(&dir)?;
    let episode_sizes: Vec<u64> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "mp3"))
        .filter_map(|entry| entry.metadata().ok().map(|metadata| metadata.len()))
        .collect();
    Ok((episode_sizes.len(), episode_sizes.iter().sum()))
}

// ---------------------------------------------------------------------------------------------------------------
// 8. Focus-timer alarm
// ---------------------------------------------------------------------------------------------------------------

/// Wakes the focus timer: sends the `alarm` event to the main window after `ms` milliseconds (at most 4 hours).
/// Page timers are slowed while the window is hidden; this thread is not. Stale alarms are harmless: the page
/// checks the real end time. Returns nothing.
#[tauri::command]
fn alarm(app: AppHandle, ms: u64) {
    const FOUR_HOURS_MS: u64 = 4 * 3600 * 1000;
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(ms.min(FOUR_HOURS_MS)));
        let _ = app.emit_to("main", "alarm", ());
    });
}

// ---------------------------------------------------------------------------------------------------------------
// 9. Pronunciation check
// ---------------------------------------------------------------------------------------------------------------

/// Pronunciation check: Windows speech recognition listens once and returns which of `phrases` it heard (`""` =
/// nothing clear). The first phrase is the word being practised; the others are similar words, so a wrong sound
/// doesn't match it. 1 to 20 phrases of at most 120 characters each.
/// Errors: "NO_KOREAN" without Windows' Korean speech pack (and always on macOS / Linux), "No microphone found".
#[tauri::command]
async fn recognize(phrases: Vec<String>) -> Result<String, String> {
    let phrases_are_valid = !phrases.is_empty()
        && phrases.len() <= 20
        && phrases
            .iter()
            .all(|phrase| !phrase.trim().is_empty() && phrase.chars().count() <= 120);
    if !phrases_are_valid {
        return Err("bad phrases".into());
    }
    #[cfg(windows)]
    return tauri::async_runtime::spawn_blocking(move || speech::recognize(phrases))
        .await
        .map_err(|e| e.to_string())?;
    #[cfg(not(windows))]
    Err("NO_KOREAN".into())
}

/// Windows speech recognition (WinRT `Windows.Media.SpeechRecognition`), limited to a list of phrases.
#[cfg(windows)]
mod speech {
    use windows::{
        core::HSTRING,
        Foundation::TimeSpan,
        Globalization::Language,
        Media::SpeechRecognition::*,
        Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED},
    };

    /// WinRT `TimeSpan` counts in units of 100 nanoseconds.
    const TICKS_PER_SECOND: i64 = 10_000_000;

    fn message(error: windows::core::Error) -> String {
        error.message().to_string()
    }

    /// Listens once; see the `recognize` command for what it returns.
    pub fn recognize(phrases: Vec<String>) -> Result<String, String> {
        let _ = unsafe { RoInitialize(RO_INIT_MULTITHREADED) }; // already initialised is fine
        if !korean_is_installed()? {
            return Err("NO_KOREAN".into());
        }
        let recognizer = phrase_recognizer(&phrases)?;
        let timeouts = recognizer.Timeouts().map_err(message)?;
        timeouts
            .SetInitialSilenceTimeout(TimeSpan {
                Duration: 5 * TICKS_PER_SECOND, // 5 s to start speaking
            })
            .map_err(message)?;
        timeouts
            .SetEndSilenceTimeout(TimeSpan {
                Duration: 8 * TICKS_PER_SECOND / 10, // 0.8 s of quiet ends it
            })
            .map_err(message)?;
        let result = recognizer
            .RecognizeAsync()
            .map_err(message)?
            .join()
            .map_err(message)?;
        let status = result.Status().map_err(message)?;
        if status == SpeechRecognitionResultStatus::MicrophoneUnavailable {
            return Err("No microphone found".into());
        }
        if status != SpeechRecognitionResultStatus::Success
            || result.Confidence().map_err(message)? == SpeechRecognitionConfidence::Rejected
        {
            return Ok(String::new());
        }
        Ok(result.Text().map_err(message)?.to_string())
    }

    /// True if Windows has a Korean speech recognition language installed.
    fn korean_is_installed() -> Result<bool, String> {
        Ok(SpeechRecognizer::SupportedGrammarLanguages()
            .map_err(message)?
            .into_iter()
            .any(|language| {
                language
                    .LanguageTag()
                    .map(|tag| tag.to_string().starts_with("ko"))
                    .unwrap_or(false)
            }))
    }

    /// A Korean recognizer that can only hear the given phrases. "NO_KOREAN" if the list can't be compiled.
    fn phrase_recognizer(phrases: &[String]) -> Result<SpeechRecognizer, String> {
        let korean = Language::CreateLanguage(&HSTRING::from("ko-KR")).map_err(message)?;
        let recognizer = SpeechRecognizer::Create(&korean).map_err(message)?;
        let phrase_list: windows_collections::IIterable<HSTRING> =
            phrases.iter().map(HSTRING::from).collect::<Vec<_>>().into();
        let constraint = SpeechRecognitionListConstraint::Create(&phrase_list).map_err(message)?;
        recognizer
            .Constraints()
            .map_err(message)?
            .Append(&constraint)
            .map_err(message)?;
        let compile_status = recognizer
            .CompileConstraintsAsync()
            .map_err(message)?
            .join()
            .map_err(message)?
            .Status()
            .map_err(message)?;
        if compile_status != SpeechRecognitionResultStatus::Success {
            return Err("NO_KOREAN".into());
        }
        Ok(recognizer)
    }
}

// ---------------------------------------------------------------------------------------------------------------
// 10. Clipboard watching ("Words in copied Korean")
// ---------------------------------------------------------------------------------------------------------------

/// Copied text worth sending to the page: not huge, and with at least one Hangul syllable.
/// The page only matches it against the word list.
fn is_korean_clip(text: &str) -> bool {
    text.len() <= 20_000 && text.chars().any(|c| ('가'..='힣').contains(&c))
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    /// Changes every time anything is copied; reading it does not open (or lock) the clipboard.
    fn GetClipboardSequenceNumber() -> u32;
}

/// Checks the clipboard's change counter twice a second and reads the text only after a new copy while the
/// setting is on. Korean text goes to the main window as the `clip` event.
#[cfg(windows)]
fn watch_clipboard(app: AppHandle) {
    std::thread::spawn(move || {
        // what was copied before the app started is ignored
        let mut last_sequence = unsafe { GetClipboardSequenceNumber() };
        let mut clipboard: Option<arboard::Clipboard> = None;
        loop {
            std::thread::sleep(Duration::from_millis(500));
            let sequence = unsafe { GetClipboardSequenceNumber() };
            if sequence == last_sequence {
                continue;
            }
            last_sequence = sequence;
            if !CLIP_ON.load(Ordering::Relaxed) {
                continue;
            }
            if clipboard.is_none() {
                clipboard = arboard::Clipboard::new().ok();
            }
            let Some(clipboard) = clipboard.as_mut() else {
                continue;
            };
            if let Ok(text) = clipboard.get_text() {
                if is_korean_clip(&text) {
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
        let mut clipboard: Option<arboard::Clipboard> = None;
        let mut last_text: Option<String> = None;
        loop {
            std::thread::sleep(Duration::from_millis(1000));
            if !CLIP_ON.load(Ordering::Relaxed) {
                last_text = None;
                continue;
            }
            if clipboard.is_none() {
                clipboard = arboard::Clipboard::new().ok();
            }
            let Some(clipboard) = clipboard.as_mut() else {
                continue;
            };
            let Ok(text) = clipboard.get_text() else {
                continue;
            };
            if last_text.as_deref() == Some(text.as_str()) {
                continue;
            }
            let is_first_read = last_text.is_none();
            last_text = Some(text.clone());
            if !is_first_read && is_korean_clip(&text) {
                let _ = app.emit_to("main", "clip", text);
            }
        }
    });
}

// ---------------------------------------------------------------------------------------------------------------
// 11. Main window and mini player
// ---------------------------------------------------------------------------------------------------------------

/// Mini player size (logical px), as in tauri.conf.json. It grows by VIDEO_H while it shows a YouTube video.
const MINI_W: f64 = 340.0;
const MINI_H: f64 = 268.0;
const VIDEO_H: f64 = 190.0;
/// Gap between a newly placed mini player and the screen's bottom-right corner (physical px).
const MINI_MARGIN: i32 = 20;

/// Brings the main window to the front (the mini player's "open app" button, notifications). Returns nothing.
#[tauri::command]
fn show_main(app: AppHandle) {
    show_main_window(&app)
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Opens the mini player, or hides it if it is showing (the mini player button on the Listen page).
/// Returns nothing; the pages hear `mini-shown` / `mini-hidden`.
#[tauri::command]
fn toggle_mini(app: AppHandle) {
    toggle_mini_window(&app)
}

/// Hides the mini player (its own close button). Returns nothing; the pages hear `mini-hidden`.
#[tauri::command]
fn hide_mini(app: AppHandle) {
    hide_mini_window(&app)
}

/// Grows (`on: true`) or shrinks the mini player for its video panel, keeping its bottom edge in place.
/// Called by the mini player page. Returns nothing.
#[tauri::command]
fn mini_video(app: AppHandle, on: bool) {
    let Some(window) = app.get_webview_window("mini") else {
        return;
    };
    let (Ok(position), Ok(old_size), Ok(scale)) = (
        window.outer_position(),
        window.outer_size(),
        window.scale_factor(),
    ) else {
        return;
    };
    let new_height = if on { MINI_H + VIDEO_H } else { MINI_H };
    let _ = window.set_size(LogicalSize::new(MINI_W, new_height));
    let new_height_physical = (new_height * scale).round() as i32;
    let _ = window.set_position(PhysicalPosition::new(
        position.x,
        position.y + old_size.height as i32 - new_height_physical,
    ));
}

/// Returns true while the mini player is on screen. The pages ask because the `mini-shown` / `mini-hidden`
/// events can arrive a moment late.
#[tauri::command]
fn mini_visible(app: AppHandle) -> bool {
    app.get_webview_window("mini")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

/// Where you last left the mini window: `<app data>/mini-pos.txt` holds its bottom-right corner "x,y" (physical
/// pixels). The bottom-right corner, because the window grows upward when a video plays in it.
fn mini_pos_file(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("mini-pos.txt"))
}

/// Saves the mini player's position, hides it and tells the pages (`mini-hidden`), so a video playing there can
/// move back to the main window.
fn hide_mini_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("mini") else {
        return;
    };
    if let (Ok(position), Ok(size), Some(file)) = (
        window.outer_position(),
        window.outer_size(),
        mini_pos_file(app),
    ) {
        let bottom_right_x = position.x + size.width as i32;
        let bottom_right_y = position.y + size.height as i32;
        let _ = fs::write(file, format!("{bottom_right_x},{bottom_right_y}"));
    }
    let _ = window.hide();
    let _ = app.emit("mini-hidden", ());
}

/// Shows the mini player (`mini-shown`), or hides it if it is visible. The first time it opens it goes where you
/// left it last time, if that spot is still on a screen; else to the bottom-right corner, above the taskbar.
fn toggle_mini_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("mini") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        hide_mini_window(app);
        return;
    }
    if !MINI_PLACED.swap(true, Ordering::Relaxed) {
        let size = window.outer_size().unwrap_or_default();
        let saved_position = saved_mini_position(app, size)
            .filter(|position| fits_on_a_screen(&window, position, size));
        match saved_position {
            Some(position) => {
                let _ = window.set_position(position);
            }
            None => place_bottom_right(&window),
        }
    }
    let _ = window.show();
    let _ = app.emit("mini-shown", ());
}

/// The top-left corner for a window of `size` whose bottom-right corner was saved in mini-pos.txt.
fn saved_mini_position(app: &AppHandle, size: PhysicalSize<u32>) -> Option<PhysicalPosition<i32>> {
    let saved = fs::read_to_string(mini_pos_file(app)?).ok()?;
    let (right, bottom) = saved.trim().split_once(',')?;
    Some(PhysicalPosition::new(
        right.parse::<i32>().ok()? - size.width as i32,
        bottom.parse::<i32>().ok()? - size.height as i32,
    ))
}

/// True if a window of `size` at `position` fits wholly inside one screen's work area (outside the taskbar).
fn fits_on_a_screen(
    window: &WebviewWindow,
    position: &PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
) -> bool {
    window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .any(|monitor| {
            let area = monitor.work_area();
            position.x >= area.position.x
                && position.y >= area.position.y
                && position.x + size.width as i32 <= area.position.x + area.size.width as i32
                && position.y + size.height as i32 <= area.position.y + area.size.height as i32
        })
}

/// Puts the window in the bottom-right corner of its screen (or the primary screen), above the taskbar.
fn place_bottom_right(window: &WebviewWindow) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    if let (Some(monitor), Ok(size)) = (monitor, window.outer_size()) {
        let area = monitor.work_area();
        let x = area.position.x + area.size.width as i32 - size.width as i32 - MINI_MARGIN;
        let y = area.position.y + area.size.height as i32 - size.height as i32 - MINI_MARGIN;
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
}

/// Closing a window: the mini player only hides; the main window hides to the tray or quits the app.
fn on_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    if window.label() == "mini" {
        api.prevent_close();
        hide_mini_window(window.app_handle());
    } else if CLOSE_TO_TRAY.load(Ordering::Relaxed) {
        api.prevent_close();
        let _ = window.hide();
    } else {
        window.app_handle().exit(0); // the hidden mini window would otherwise keep the app alive
    }
}

// ---------------------------------------------------------------------------------------------------------------
// 12. Tray icon
// ---------------------------------------------------------------------------------------------------------------

/// The tray icon: left click opens the app; right click shows the menu.
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Hangul Learner", true, None::<&str>)?;
    let mini = MenuItem::with_id(app, "mini", "Mini player", true, None::<&str>)?;
    let play = MenuItem::with_id(app, "play", "Play / pause", true, None::<&str>)?;
    let focus = MenuItem::with_id(app, "focus", "Focus timer", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &mini, &play, &focus, &separator, &quit])?;
    TrayIconBuilder::with_id("tray")
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("Hangul Learner")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(on_tray_menu)
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
    Ok(())
}

/// Tray menu items; play/pause and the focus timer go to the page as `player-cmd`.
fn on_tray_menu(app: &AppHandle, event: MenuEvent) {
    match event.id.as_ref() {
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
    }
}

// ---------------------------------------------------------------------------------------------------------------
// 13. Start-up
// ---------------------------------------------------------------------------------------------------------------

fn main() {
    tauri::Builder::default()
        // a second launch (e.g. from the Start menu while the app sits in the tray) just shows this one:
        // two copies would both write progress.json
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app)
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(on_global_shortcut)
                .build(),
        )
        .setup(|app| {
            // Started with the system: stay in the tray. Otherwise show the window (it starts hidden to avoid a flash).
            if !std::env::args().any(|arg| arg == "--minimized") {
                show_main_window(app.handle());
            }
            build_tray(app)?;
            watch_clipboard(app.handle().clone());
            Ok(())
        })
        .on_window_event(on_window_event)
        .invoke_handler(tauri::generate_handler![
            load_progress,
            save_progress,
            fetch_text,
            open_external,
            close_to_tray,
            toggle_mini,
            hide_mini,
            show_main,
            mini_video,
            mini_visible,
            set_shortcuts,
            autostart,
            export_backup,
            show_in_folder,
            clip_watch,
            alarm,
            sync_default,
            sync_read,
            sync_write,
            recognize,
            prune_backups,
            download_episode,
            delete_episodes,
            episodes_size,
            download_progress,
            cancel_download
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Hangul Learner");
}
