import React, { useEffect } from 'react';
import { Modal, Form, Input, message } from 'antd';
import axios from 'axios';

type CreateCustomerModalProps = {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
};

type CustomerFormValues = {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
};

const CreateCustomerModal: React.FC<CreateCustomerModalProps> = ({
    open,
    onClose,
    onSuccess,
}) => {
    const [form] = Form.useForm<CustomerFormValues>();

    useEffect(() => {
        if (!open) {
            form.resetFields();
        }
    }, [open, form]);

    const handleSubmit = async (values: CustomerFormValues) => {
        const payload = {
            name: (values.name ?? '').trim(),
            email: (values.email ?? '').trim(),
            phone: (values.phone ?? '').trim(),
            address: (values.address ?? '').trim(),
        };

        try {
            await axios.post('/api/customers/', payload);
            message.success('Customer created.');
            onSuccess?.();
            onClose();
        } catch (err: any) {
            const code = err?.response?.status;
            if (code === 401 || code === 403) {
                message.error('Not authorized. Please login as staff.');
            } else {
                message.error('Failed to create customer.');
            }
        }
    };

    return (
        <Modal
            open={open}
            title="New Customer"
            okText="Create"
            onCancel={onClose}
            onOk={() => form.submit()}
            destroyOnClose
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
                autoComplete="off"
            >
                <Form.Item
                    name="name"
                    label="Name"
                    rules={[{ required: true, message: 'Please enter customer name' }]}
                >
                    <Input placeholder="Customer name" />
                </Form.Item>

                <Form.Item name="email" label="Email">
                    <Input placeholder="Email (optional)" />
                </Form.Item>

                <Form.Item name="phone" label="Phone">
                    <Input placeholder="Phone (optional)" />
                </Form.Item>

                <Form.Item name="address" label="Address">
                    <Input.TextArea placeholder="Address (optional)" rows={3} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default CreateCustomerModal;