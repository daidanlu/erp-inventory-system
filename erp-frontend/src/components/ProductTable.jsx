import React, { useEffect, useState } from 'react'
import { Table, message } from 'antd'
import axios from 'axios'

const ProductTable = () => {
  const [data, setData] = useState([])

  useEffect(() => {
    axios.get('http://127.0.0.1:8000/api/products/')
      .then(res => setData(res.data))
      .catch(() => message.error('Failed to load products'))
  }, [])

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    { title: 'SKU', dataIndex: 'sku', key: 'sku' },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Stock', dataIndex: 'stock', key: 'stock' },
  ]

  return <Table dataSource={data} columns={columns} rowKey="id" />
}

export default ProductTable
