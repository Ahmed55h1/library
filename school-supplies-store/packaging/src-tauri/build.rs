use std::env;
use url::Url;

fn main() {
    for key in ["MAKTABATI_STORE_URL", "MAKTABATI_APPROVED_ORIGINS"] {
        println!("cargo:rerun-if-env-changed={key}");
    }
    let store = env::var("MAKTABATI_STORE_URL").expect("Set an approved private HTTPS store URL");
    let approved = env::var("MAKTABATI_APPROVED_ORIGINS").expect("Set explicitly approved HTTPS origins");
    let url = Url::parse(&store).expect("Invalid store URL");
    assert!(url.scheme() == "https" && url.host_str().is_some() && url.username().is_empty()
        && url.password().is_none() && url.query().is_none() && url.fragment().is_none()
        && url.path() == "/", "Store URL must be an HTTPS origin without credentials");
    let origins: Vec<String> = approved.split(',').map(|origin| {
        let u = Url::parse(origin.trim()).expect("Invalid approved origin");
        assert!(u.scheme() == "https" && u.host_str().is_some() && u.username().is_empty()
            && u.password().is_none() && u.path() == "/" && u.query().is_none()
            && u.fragment().is_none(), "Approve exact HTTPS origins only");
        u.origin().ascii_serialization()
    }).collect();
    assert!(origins.contains(&url.origin().ascii_serialization()), "Store origin is not approved");
    println!("cargo:rustc-env=MAKTABATI_STORE_URL={}", url.as_str());
    println!("cargo:rustc-env=MAKTABATI_APPROVED_ORIGINS={}", origins.join(","));
    tauri_build::build();
}
