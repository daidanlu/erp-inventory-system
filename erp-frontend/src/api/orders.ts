import request from '@/utils/request';

export interface CreateOrderPayload {
  customer_id: number;
  items: {
    product_id: number;
    quantity: number;
  }[];
}

export const createOrder = async (payload: CreateOrderPayload) => {
  return request.post('/orders/', payload); 
};