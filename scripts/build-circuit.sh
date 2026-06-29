#!/bin/bash
set -e

CIRCUIT_DIR="src/circuits"
BUILD_DIR="src/circuits/build"
NAME="patient"

mkdir -p "$BUILD_DIR"

echo "[1/5] Compiling circuit..."
circom "$CIRCUIT_DIR/$NAME.circom" --r1cs --wasm --sym -o "$BUILD_DIR" -l node_modules
echo "      → $BUILD_DIR/$NAME.r1cs"
echo "      → $BUILD_DIR/${NAME}_js/$NAME.wasm"

echo "[2/5] Generating Powers of Tau (pot12)..."
npx snarkjs powersoftau new bn128 12 "$BUILD_DIR/pot12_0000.ptau" -v 2>&1 | tail -3

echo "[3/5] Preparing final ptau..."
npx snarkjs powersoftau prepare phase2 "$BUILD_DIR/pot12_0000.ptau" "$BUILD_DIR/pot12_final.ptau" -v 2>&1 | tail -3

echo "[4/5] Generating zkey..."
npx snarkjs groth16 setup "$BUILD_DIR/$NAME.r1cs" "$BUILD_DIR/pot12_final.ptau" "$BUILD_DIR/${NAME}_0000.zkey"

echo "[4b/5] Phase 2 contribution..."
npx snarkjs zkey contribute "$BUILD_DIR/${NAME}_0000.zkey" "$BUILD_DIR/${NAME}_final.zkey" \
  --name="dev-contribution" -e="corti-zkip-dev-entropy-$(date +%s)" -v 2>&1 | tail -3

echo "[5/5] Exporting verification key..."
npx snarkjs zkey export verificationkey "$BUILD_DIR/${NAME}_final.zkey" "$BUILD_DIR/verification_key.json"

echo ""
echo "=== Circuit build complete ==="
echo "  R1CS:             $BUILD_DIR/$NAME.r1cs"
echo "  WASM:             $BUILD_DIR/${NAME}_js/$NAME.wasm"
echo "  ZKey:             $BUILD_DIR/${NAME}_final.zkey"
echo "  Verification key: $BUILD_DIR/verification_key.json"
