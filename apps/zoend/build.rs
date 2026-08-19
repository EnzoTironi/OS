use std::error::Error;

fn main() -> Result<(), Box<dyn Error>> {
    connectrpc_build::Config::new()
        .files(&["zoen/definition/v1/definition.proto"])
        .descriptor_set("../../proto/definition_descriptor.binpb")
        .include_file("_connectrpc.rs")
        .compile()?;
    println!("cargo:rerun-if-changed=../../proto/definition_descriptor.binpb");
    println!("cargo:rerun-if-changed=../../proto/zoen/definition/v1/definition.proto");
    Ok(())
}
