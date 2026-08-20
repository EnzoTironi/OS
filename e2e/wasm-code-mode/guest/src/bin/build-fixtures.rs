use std::env;
use std::error::Error;
use std::fmt::Write;
use std::fs;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use wit_component::ComponentEncoder;

const AMBIENT_IMPORTS: [(&str, &str); 4] = [
    ("ambient-environment", "wasi:cli/environment@0.2.0"),
    ("ambient-filesystem", "wasi:filesystem/types@0.2.0"),
    ("ambient-network", "wasi:sockets/network@0.2.0"),
    ("ambient-secret", "zoen:secrets/store@1.0.0"),
];

fn main() -> Result<(), Box<dyn Error>> {
    let mut arguments = env::args_os().skip(1);
    let core_module = required_path(arguments.next(), "core module path")?;
    let output_directory = required_path(arguments.next(), "output directory")?;
    if arguments.next().is_some() {
        return Err("usage: build-fixtures <core-module> <output-directory>".into());
    }

    let module = fs::read(core_module)?;
    let component = ComponentEncoder::default()
        .module(&module)?
        .validate(true)
        .encode()?;
    fs::create_dir_all(&output_directory)?;
    write_fixture(&output_directory, "program", &component)?;
    write_fixture(
        &output_directory,
        "interface-mismatch",
        &wat::parse_str("(component)")?,
    )?;
    for (name, import) in AMBIENT_IMPORTS {
        let source = format!("(component (import \"{import}\" (instance)))");
        write_fixture(&output_directory, name, &wat::parse_str(source)?)?;
    }
    Ok(())
}

fn required_path(value: Option<std::ffi::OsString>, name: &str) -> Result<PathBuf, Box<dyn Error>> {
    value
        .map(PathBuf::from)
        .ok_or_else(|| format!("missing {name}").into())
}

fn write_fixture(directory: &Path, name: &str, bytes: &[u8]) -> Result<(), Box<dyn Error>> {
    let component_path = directory.join(format!("{name}.component.wasm"));
    fs::write(&component_path, bytes)?;
    let mut digest = String::with_capacity(64);
    for byte in Sha256::digest(bytes) {
        write!(&mut digest, "{byte:02x}")?;
    }
    fs::write(
        directory.join(format!("{name}.component.sha256")),
        format!("{digest}\n"),
    )?;
    Ok(())
}
