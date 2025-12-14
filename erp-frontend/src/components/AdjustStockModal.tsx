// src/components/AdjustStockModal.tsx
import React, { useEffect } from 'react';
import { Modal, Form, InputNumber, Typography, message } from 'antd';
import axios from 'axios';

const { Text } = Typography;

export type ProductForAdjust = {
  id: number;
  sku: string;
  name: string;
  stock: number;
};

interface AdjustStockModalProps {
  open: boolean;
  product: ProductForAdjust | null;
  onClose: () => void;
  onSuccess: () => void;
}

const AdjustStockModal: React.FC<AdjustStockModalProps> = ({
  open,
  product,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm<{ delta: number }>();

  useEffect(() => {
    if (open) {
      // reset form
      form.resetFields();
    }
  }, [open, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const delta = values.delta;

      if (!product) {
        message.error('No product selected');
        return;
      }

      if (!delta || delta === 0) {
        message.warning('Please enter a non-zero adjustment value');
        return;
      }

      // call backend bulk_adjust_stock API
      await axios.post('/api/products/bulk_adjust_stock/', [
        {
          product_id: product.id,
          delta: delta,
        },
      ]);

      message.success('Stock adjusted successfully');
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err?.errorFields) {
        // form error check
        return;
      }
      console.error('Failed to adjust stock', err?.response || err);
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        'Failed to adjust stock';
      message.error(detail);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <Modal
      open={open}
      title="Adjust Stock"
      onOk={handleOk}
      onCancel={handleCancel}
      okText="Submit"
      destroyOnClose
    >
      {product ? (
        <div style={{ marginBottom: 16 }}>
          <div>
            <Text strong>{product.name}</Text>
          </div>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary">
              SKU: {product.sku} · Current stock: {product.stock}
            </Text>
          </div>
        </div>
      ) : (
        <Text type="secondary">No product selected.</Text>
      )}

      <Form form={form} layout="vertical">
        <Form.Item
          label="Adjustment amount (can be negative)"
          name="delta"
          rules={[
            { required: true, message: 'Please enter an adjustment amount' },
          ]}
        >
          <InputNumber style={{ width: '100%' }} min={-100000} max={100000} />
        </Form.Item>
      </Form>

      <div style={{ marginTop: 8 }}>
        <Text type="secondary">
          Example: enter <Text code>10</Text> to increase stock by 10, or{' '}
          <Text code>-3</Text> to decrease stock by 3. The backend will reject
          changes that would make stock negative.
        </Text>
      </div>
    </Modal>
  );
};

export default AdjustStockModal;
