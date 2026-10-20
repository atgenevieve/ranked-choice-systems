//! Records the git commit the engine was built from, so every results file can name it.
use std::process::Command;

fn git(args: &[&str]) -> Option<String> {
    let out = Command::new("git").args(args).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn main() {
    let commit = git(&["rev-parse", "HEAD"]).unwrap_or_else(|| "unknown".into());
    // "dirty" means the engine folder had uncommitted changes at build time
    let dirty = git(&["status", "--porcelain", "--", "."]).map(|s| !s.is_empty()).unwrap_or(true);
    println!("cargo:rustc-env=STVSIM_COMMIT={commit}");
    println!("cargo:rustc-env=STVSIM_DIRTY={dirty}");
    for p in ["src", "Cargo.toml", "../.git/HEAD", "../.git/index", "../.git/refs"] {
        println!("cargo:rerun-if-changed={p}");
    }
}
