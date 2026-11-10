#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let store = url::Url::parse(env!("MAKTABATI_STORE_URL"))?;
            let origins: Vec<String> = env!("MAKTABATI_APPROVED_ORIGINS")
                .split(',').map(str::to_owned).collect();
            let builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(store))
                .title("Maktabati · Private test")
                .inner_size(1280.0, 850.0)
                .min_inner_size(360.0, 640.0)
                .on_navigation(move |url| url.scheme() == "https" && origins.contains(&url.origin().ascii_serialization()))
                .on_download(|_, _| false)
                .on_permission_request(|_, _| tauri::webview::PermissionResponse::Deny);
            #[cfg(desktop)]
            let builder = builder.on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny);
            builder.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Unable to launch the private store");
}
