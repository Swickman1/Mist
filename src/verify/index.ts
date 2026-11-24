// Seam: file integrity checks. Unimplemented; the UI surfaces the error.

export async function sha256File(_path: string): Promise<string> {
  throw new Error('sha256File: not implemented')
}
