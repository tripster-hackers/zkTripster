//! An end-to-end example of using the SP1 SDK to generate a proof of a program that can be verified
//! on-chain.
//!
//! You can run this script using the following command:
//! ```shell
//! RUST_LOG=info cargo run --package fibonacci-script --bin prove --release
//! ```

use std::{
    fs,
    ops::Add,
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use alloy_sol_types::{sol, SolType};
use clap::Parser;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sp1_sdk::{HashableKey, ProverClient, SP1ProofWithPublicValues, SP1Stdin};

/// The ELF (executable and linkable format) file for the Succinct RISC-V zkVM.
///
/// This file is generated by running `cargo prove build` inside the `program` directory.
pub const ZKPOEX_ELF: &[u8] = include_bytes!("../../zk-poex/elf/riscv32im-succinct-zkvm-elf");

/// The arguments for the prove command.
#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct ProveArgs {
    #[clap(short, long, help = "proof path", default_value = "./zkpoex.bincode")]
    pub path: String,
}

fn main() {
    // Setup the logger.
    sp1_sdk::utils::setup_logger();

    // Parse the command line arguments.
    let args = ProveArgs::parse();

    // Setup the prover client.
    let client = ProverClient::new();
    client.setup(ZKPOEX_ELF);

    let (_, vk) = client.setup(ZKPOEX_ELF);

    println!("vk: {:?}", hex::encode(vk.hash_bytes()));

    let proof = SP1ProofWithPublicValues::load(args.path).unwrap();

    println!("verifying proof...");
    client.verify(&proof, &vk).expect("failed to verify proof");

    let (before, after, hash_private_inputs, chacha_cipher, key_hash): (
        String,
        String,
        String,
        Vec<u8>,
        String,
        // Vec<u8>,
        // u64,
    ) = bincode::deserialize(proof.public_values.as_slice())
        .expect("failed to deserialize public values");

    std::fs::write(PathBuf::from("./data/zkpoex_chacha"), &chacha_cipher)
        .expect("failed to write fixture");

    println!("Key hash: {}", key_hash);
    println!("Make sure it's the same as in the contract!")
}
