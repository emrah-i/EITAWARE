export interface ApiError { error: string; fields?: Record<string, string>; }
export interface ContactRequest {
  name: string; email: string; subject: string; message: string;
  website?: string; idempotencyKey: string;
}
export interface ContactResponse { accepted: true; reference: string; }
