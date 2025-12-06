import React, { useEffect, useState } from 'react';
import { Modal, Form, Select, InputNumber, Button, Space, message, Divider } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import request from '@/utils/request'; 
import { createOrder, type CreateOrderPayload } from '../api/orders';

interface CreateOrderModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface SimpleCustomer { id: number; name: string; }
interface SimpleProduct { id: number; name: string; sku: string; stock: number; }

const CreateOrderModal: React.FC<CreateOrderModalProps> = ({ open, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  
  // data source for the drop-down menu
  const [customers, setCustomers] = useState<SimpleCustomer[]>([]);
  const [products, setProducts] = useState<SimpleProduct[]>([]);

  // load customer and product data when the pop-up window is opened
  useEffect(() => {
    if (open) {
      const fetchData = async () => {
        try {
          
          const [custRes, prodRes] = await Promise.all([
            request.get('/customers/'),
            request.get('/products/')
          ]);
          
          // compatible with pagination format { results: [] } or direct array []
          setCustomers(Array.isArray(custRes.data) ? custRes.data : custRes.data.results);
          setProducts(Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.results);
        } catch (error) {
          message.error('Failed to load customers or products');
        }
      };
      fetchData();
    }
  }, [open]);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      // payload compatible with backend
      const payload: CreateOrderPayload = {
        customer_id: values.customer_id,
        items: values.items.map((item: any) => ({
          product_id: item.product_id,
          quantity: item.quantity
        }))
      };

      await createOrder(payload);
      message.success('Order created successfully!');
      form.resetFields();
      onSuccess();
      onClose();
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || 'Failed to create order';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Create New Order"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()} // clicking Modal OK button triggers submission
      confirmLoading={loading}
      width={600}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ items: [{}] }}>
        
        {/* 1. Select Customer */}
        <Form.Item 
          name="customer_id" 
          label="Customer" 
          rules={[{ required: true, message: 'Please select a customer' }]}
        >
          <Select placeholder="Select a customer" showSearch optionFilterProp="label">
            {customers.map(c => (
              <Select.Option key={c.id} value={c.id} label={c.name}>
                {c.name} (ID: {c.id})
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Divider>Order Items</Divider>

        {/* 2. Dynamic Product List (Form.List) */}
        <Form.List name="items">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name, ...restField }) => (
                <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  {/* Product Selection */}
                  <Form.Item
                    {...restField}
                    name={[name, 'product_id']}
                    rules={[{ required: true, message: 'Missing product' }]}
                    style={{ width: 250 }}
                  >
                    <Select placeholder="Select Product" showSearch optionFilterProp="label">
                      {products.map(p => (
                        <Select.Option key={p.id} value={p.id} label={p.name}>
                          {p.sku} - {p.name} (Stock: {p.stock})
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>

                  {/* Quantity input */}
                  <Form.Item
                    {...restField}
                    name={[name, 'quantity']}
                    rules={[{ required: true, message: 'Missing quantity' }]}
                  >
                    <InputNumber min={1} placeholder="Qty" />
                  </Form.Item>

                  {/* Delete button */}
                  <MinusCircleOutlined onClick={() => remove(name)} style={{ color: 'red' }} />
                </Space>
              ))}
              
              <Form.Item>
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                  Add Product
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
};

export default CreateOrderModal;