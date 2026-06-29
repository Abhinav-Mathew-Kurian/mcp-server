declare module 'snarkjs' {
  const groth16: {
    fullProve(
      input: Record<string, string>,
      wasmFile: string,
      zkeyFile: string
    ): Promise<{ proof: object; publicSignals: string[] }>;
    verify(
      vkey: object,
      publicSignals: string[],
      proof: object
    ): Promise<boolean>;
  };
}
