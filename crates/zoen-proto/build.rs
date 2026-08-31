use std::error::Error;

fn main() -> Result<(), Box<dyn Error>> {
    connectrpc_build::Config::new()
        .files(&[
            "zoen/action/v1/action.proto",
            "zoen/computation/v1/computation.proto",
            "zoen/definition/v1/definition.proto",
            "zoen/effect/v1/effect.proto",
            "zoen/history/v1/history.proto",
            "zoen/world/v1/world.proto",
        ])
        .descriptor_set("../../proto/definition_descriptor.binpb")
        .include_file("_connectrpc.rs")
        .compile()?;
    println!("cargo:rerun-if-changed=../../proto/definition_descriptor.binpb");
    println!("cargo:rerun-if-changed=../../proto/zoen/action/v1/action.proto");
    println!("cargo:rerun-if-changed=../../proto/zoen/computation/v1/computation.proto");
    println!("cargo:rerun-if-changed=../../proto/zoen/definition/v1/definition.proto");
    println!("cargo:rerun-if-changed=../../proto/zoen/effect/v1/effect.proto");
    println!("cargo:rerun-if-changed=../../proto/zoen/history/v1/history.proto");
    println!("cargo:rerun-if-changed=../../proto/zoen/world/v1/world.proto");
    Ok(())
}
