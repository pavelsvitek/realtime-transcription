fn main() {
    println!("cargo:rerun-if-changed=../nemotron-helper/Sources");
    println!("cargo:rerun-if-changed=../nemotron-helper/Package.swift");
    tauri_build::build();

    #[cfg(target_os = "macos")]
    embed_info_plist();
}

#[cfg(target_os = "macos")]
fn embed_info_plist() {
    use std::path::Path;

    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let plist_path = Path::new(&manifest_dir).join("Info.plist");

    println!("cargo:rerun-if-changed={}", plist_path.display());
    println!(
        "cargo:rustc-link-arg=-Wl,-sectcreate,__TEXT,__info_plist,{}",
        plist_path.display()
    );
}
