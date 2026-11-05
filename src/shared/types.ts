export interface DeliveryAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: 'US';
}
export interface CheckoutRequest {
  productId: string;
  quantity: number;
  email: string;
  name: string;
  address: DeliveryAddress;
  idempotencyKey: string;
  website?: string;
}
export interface CheckoutResponse { checkoutUrl: string; }
export interface ApiError { error: string; fields?: Record<string, string>; code?: string; }
export interface ProductResponse {
  id: string; status: 'available' | 'coming-soon'; priceCents: number | null; currency: string; maxQuantity: number;
  available: boolean; checkoutMode: 'test' | 'live' | 'unavailable';
}
export interface CheckoutStatusResponse {
  status: 'pending' | 'paid' | 'expired' | 'refunded' | 'partially_refunded'; orderReference?: string; totalCents?: number; currency?: string;
}
export interface ContactRequest {
  name: string; email: string; subject: string; message: string;
  website?: string; idempotencyKey: string;
}
export interface ContactResponse { accepted: true; reference: string; }
