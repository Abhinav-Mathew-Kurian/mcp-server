pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";

// Proves three things as public signals without revealing raw data:
//   1. Patient age is within a 10-year bracket [ageRangeLow, ageRangeHigh]
//   2. Primary diagnosis maps to a valid ICD chapter (1-22)
//   3. A Poseidon commitment over (patientKeyFp, factsFp) is valid
template PatientRecord() {
    // ── Private inputs (prover knows, verifier never sees) ──────────────────
    signal input ageYears;        // exact age (e.g. 47)
    signal input ageBracketLow;   // bracket floor: floor(age/10)*10 (e.g. 40)
    signal input diagnosisChapter; // ICD chapter number (e.g. 9)
    signal input patientKeyFp;    // patient key reduced to BN128 field element
    signal input factsFp;         // clinical facts hash reduced to field element

    // ── Public outputs (verifier sees these) ────────────────────────────────
    signal output ageRangeLow;    // 40
    signal output ageRangeHigh;   // 49
    signal output icdChapter;     // 9
    signal output dataCommitment; // Poseidon(patientKeyFp, factsFp)

    // ── Signal 1: Age is within [ageBracketLow, ageBracketLow + 9] ─────────
    component ageGte = GreaterEqThan(8);
    ageGte.in[0] <== ageYears;
    ageGte.in[1] <== ageBracketLow;
    ageGte.out === 1;

    component ageLte = LessEqThan(8);
    ageLte.in[0] <== ageYears;
    ageLte.in[1] <== ageBracketLow + 9;
    ageLte.out === 1;

    ageRangeLow  <== ageBracketLow;
    ageRangeHigh <== ageBracketLow + 9;

    // ── Signal 2: ICD chapter is in valid range [1, 22] ────────────────────
    component chapGte = GreaterEqThan(8);
    chapGte.in[0] <== diagnosisChapter;
    chapGte.in[1] <== 1;
    chapGte.out === 1;

    component chapLte = LessEqThan(8);
    chapLte.in[0] <== diagnosisChapter;
    chapLte.in[1] <== 22;
    chapLte.out === 1;

    icdChapter <== diagnosisChapter;

    // ── Signal 3: Poseidon commitment ───────────────────────────────────────
    component hasher = Poseidon(2);
    hasher.inputs[0] <== patientKeyFp;
    hasher.inputs[1] <== factsFp;
    dataCommitment <== hasher.out;
}

component main = PatientRecord();
