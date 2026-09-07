use serde::Deserialize;
use tauri::AppHandle;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDialog {
    message: String,
    detail: String,
    #[serde(default)]
    busy: bool,
    confirm_label: Option<String>,
}

#[tauri::command]
pub async fn show_update_dialog(app: AppHandle, dialog: UpdateDialog) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        macos::show(app, dialog).await
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
        if dialog.busy {
            return Ok(false);
        }
        let confirmation = dialog.confirm_label.is_some();
        let buttons = match dialog.confirm_label {
            Some(label) => MessageDialogButtons::OkCancelCustom(label, "Cancel".into()),
            None => MessageDialogButtons::Ok,
        };
        let (tx, mut rx) = tauri::async_runtime::channel(1);
        app.dialog()
            .message(format!("{}\n\n{}", dialog.message, dialog.detail))
            .title("Software update")
            .buttons(buttons)
            .show(move |accepted| {
                let _ = tx.try_send(confirmation && accepted);
            });
        rx.recv().await.ok_or_else(|| "Update dialog closed".into())
    }
}

#[tauri::command]
pub fn close_update_dialog(_app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    _app.run_on_main_thread(macos::close)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn focus_update_dialog(_app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    _app.run_on_main_thread(macos::focus)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    crate::EXIT_ALLOWED.store(true, std::sync::atomic::Ordering::SeqCst);
    app.request_restart();
}

#[cfg(target_os = "macos")]
mod macos {
    use super::UpdateDialog;
    use objc2::rc::Retained;
    use objc2::runtime::ProtocolObject;
    use objc2::{define_class, msg_send, sel, DefinedClass, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSAlert, NSAlertStyle, NSAppearance, NSAppearanceCustomization, NSApplication, NSButton,
        NSModalPanelWindowLevel, NSProgressIndicator, NSProgressIndicatorStyle, NSWindow,
        NSWindowDelegate,
    };
    use objc2_foundation::{
        ns_string, NSObject, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString,
    };
    use std::cell::{Cell, OnceCell, RefCell};
    use tauri::async_runtime::{channel, Sender};
    use tauri::AppHandle;

    #[derive(Default)]
    struct ActionState {
        reply: RefCell<Option<Sender<bool>>>,
        confirmation: Cell<bool>,
        window: OnceCell<Retained<NSWindow>>,
        buttons: OnceCell<[Retained<NSButton>; 2]>,
    }

    define_class!(
        #[unsafe(super = NSObject)]
        #[thread_kind = MainThreadOnly]
        #[ivars = ActionState]
        struct MonuraUpdateDialogActions;

        unsafe impl NSObjectProtocol for MonuraUpdateDialogActions {}

        unsafe impl NSWindowDelegate for MonuraUpdateDialogActions {
            #[unsafe(method(windowShouldClose:))]
            fn window_should_close(&self, _window: &NSWindow) -> bool {
                self.respond(false);
                false
            }
        }

        impl MonuraUpdateDialogActions {
            #[unsafe(method(confirm:))]
            fn confirm(&self, _sender: &NSObject) {
                self.respond(true);
            }

            #[unsafe(method(cancel:))]
            fn cancel(&self, _sender: &NSObject) {
                self.respond(false);
            }
        }
    );

    impl MonuraUpdateDialogActions {
        fn respond(&self, accepted: bool) {
            let Some(reply) = self.ivars().reply.borrow_mut().take() else {
                return;
            };
            let confirmed = accepted && self.ivars().confirmation.get();
            if let Some(buttons) = self.ivars().buttons.get() {
                for button in buttons {
                    button.setEnabled(false);
                }
            }
            if !confirmed {
                if let Some(window) = self.ivars().window.get() {
                    window.orderOut(None);
                }
            }
            let _ = reply.try_send(confirmed);
        }
    }

    struct NativeDialog {
        alert: Retained<NSAlert>,
        actions: Retained<MonuraUpdateDialogActions>,
        primary: Retained<NSButton>,
        cancel: Retained<NSButton>,
        progress: Retained<NSProgressIndicator>,
    }

    thread_local! {
        static DIALOG: RefCell<Option<NativeDialog>> = const { RefCell::new(None) };
    }

    impl NativeDialog {
        fn new(mtm: MainThreadMarker) -> Self {
            let alert = NSAlert::new(mtm);
            alert.setAlertStyle(NSAlertStyle::Informational);
            let primary = alert.addButtonWithTitle(ns_string!("OK"));
            let cancel = alert.addButtonWithTitle(ns_string!("Cancel"));
            let actions: Retained<MonuraUpdateDialogActions> = unsafe {
                msg_send![
                    super(MonuraUpdateDialogActions::alloc(mtm).set_ivars(ActionState::default())),
                    init
                ]
            };
            let window = alert.window();
            let _ = actions.ivars().window.set(window.clone());
            let _ = actions
                .ivars()
                .buttons
                .set([primary.clone(), cancel.clone()]);
            unsafe {
                primary.setTarget(Some(&actions));
                primary.setAction(Some(sel!(confirm:)));
                cancel.setTarget(Some(&actions));
                cancel.setAction(Some(sel!(cancel:)));
                window.setReleasedWhenClosed(false);
            }
            primary.setKeyEquivalent(ns_string!("\r"));
            cancel.setKeyEquivalent(ns_string!("\u{1b}"));
            window.setDelegate(Some(ProtocolObject::from_ref(&*actions)));
            window.setAppearance(
                NSAppearance::appearanceNamed(ns_string!("NSAppearanceNameDarkAqua")).as_deref(),
            );
            window.setLevel(NSModalPanelWindowLevel);
            window.setTitle(ns_string!("Software update"));
            let progress = NSProgressIndicator::initWithFrame(
                NSProgressIndicator::alloc(mtm),
                NSRect::new(NSPoint::ZERO, NSSize::new(20.0, 20.0)),
            );
            progress.setStyle(NSProgressIndicatorStyle::Spinning);
            progress.setIndeterminate(true);
            progress.setDisplayedWhenStopped(false);
            Self {
                alert,
                actions,
                primary,
                cancel,
                progress,
            }
        }

        fn show(&self, dialog: UpdateDialog, reply: Sender<bool>) {
            if let Some(previous) = self.actions.ivars().reply.borrow_mut().take() {
                let _ = previous.try_send(false);
            }
            let confirmation = dialog.confirm_label.is_some();
            self.actions.ivars().confirmation.set(confirmation);
            self.alert
                .setMessageText(&NSString::from_str(&dialog.message));
            self.alert
                .setInformativeText(&NSString::from_str(&dialog.detail));
            self.primary.setTitle(&NSString::from_str(
                dialog.confirm_label.as_deref().unwrap_or("OK"),
            ));
            self.primary.setEnabled(!dialog.busy);
            self.cancel.setEnabled(!dialog.busy);
            if dialog.busy {
                self.alert.setAccessoryView(Some(&self.progress));
                unsafe { self.progress.startAnimation(None) };
            } else {
                unsafe { self.progress.stopAnimation(None) };
                self.progress.removeFromSuperview();
                self.alert.setAccessoryView(None);
            }
            self.primary.setHidden(dialog.busy);
            self.cancel.setHidden(!confirmation || dialog.busy);
            self.alert.layout();
            self.progress.setHidden(!dialog.busy);
            self.primary.setHidden(dialog.busy);
            self.cancel.setHidden(!confirmation || dialog.busy);
            let window = self.alert.window();
            if !window.isVisible() {
                window.center();
            }
            window.makeKeyAndOrderFront(None);
            if dialog.busy {
                let _ = reply.try_send(false);
            } else {
                self.actions.ivars().reply.replace(Some(reply));
            }
        }
    }

    pub async fn show(app: AppHandle, dialog: UpdateDialog) -> Result<bool, String> {
        let (tx, mut rx) = channel(1);
        app.run_on_main_thread(move || {
            let mtm = MainThreadMarker::new().expect("Update dialog requires the main thread");
            DIALOG.with_borrow_mut(|current| {
                current
                    .get_or_insert_with(|| NativeDialog::new(mtm))
                    .show(dialog, tx);
            });
            #[allow(deprecated)]
            NSApplication::sharedApplication(mtm).activateIgnoringOtherApps(true);
        })
        .map_err(|error| error.to_string())?;
        rx.recv().await.ok_or_else(|| "Update dialog closed".into())
    }

    pub fn close() {
        DIALOG.with_borrow_mut(|current| {
            if let Some(dialog) = current.take() {
                dialog.actions.respond(false);
                dialog.alert.window().orderOut(None);
            }
        });
    }

    pub fn focus() {
        DIALOG.with_borrow(|current| {
            if let Some(dialog) = current {
                dialog.alert.window().makeKeyAndOrderFront(None);
            }
        });
    }
}
