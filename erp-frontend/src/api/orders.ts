// src/api/orders.ts
import axios from 'axios';

export interface OrderItemInput {
  product_id: number;
  quantity: number;
}

export interface CreateOrderPayload {
  customer_id?: number | null;
  customer_name: string;
  items: OrderItemInput[];
}

export async function createOrder(payload: CreateOrderPayload) {
  const resp = await axios.post('/api/orders/', payload);
  return resp.data;
}
