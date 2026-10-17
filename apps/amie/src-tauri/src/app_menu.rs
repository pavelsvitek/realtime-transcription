//! Native macOS application menu (Amie → Check for Updates…).

use tauri::{
    menu::{MenuBuilder, SubmenuBuilder},
    AppHandle, Emitter, Runtime,
};

pub const MENU_CHECK_FOR_UPDATES: &str = "check_for_updates";
pub const EVENT_CHECK_FOR_UPDATES: &str = "menu/check-for-updates";

/// Build the macOS app menu and wire Check for Updates to a frontend event.
///
/// On macOS the first submenu becomes the application menu regardless of its
/// label — keep the product name **Amie** there.
#[cfg(target_os = "macos")]
pub fn install_macos_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let amie_menu = SubmenuBuilder::new(app, "Amie")
        .about(None)
        .separator()
        .text(MENU_CHECK_FOR_UPDATES, "Check for Updates…")
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&amie_menu, &edit_menu, &window_menu])
        .build()?;

    app.set_menu(menu)?;

    let handle = app.clone();
    app.on_menu_event(move |_app, event| {
        if event.id() == MENU_CHECK_FOR_UPDATES {
            if let Err(err) = handle.emit(EVENT_CHECK_FOR_UPDATES, ()) {
                tracing::warn!(error = %err, "Failed to emit check-for-updates menu event");
            }
        }
    });

    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn install_macos_app_menu<R: Runtime>(_app: &AppHandle<R>) -> tauri::Result<()> {
    Ok(())
}
