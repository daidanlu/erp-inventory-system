// src/components/ProductList.tsx
import React, { useEffect, useState } from 'react'
import { Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'

type Product = {
  id: number
  sku: string
  name: string
  stock: number
}

type ProductListResponse = {
  count: number
  next: string | null
  previous: string | null
  results: Product[]
}

const ProductList: React.FC = () => {
  const [data, setData] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const fetchProducts = async (pageNum = 1) => {
    setLoading(true)
    try {
      const resp = await axios.get<ProductListResponse>(
        '/api/products/', 
        { params: { page: pageNum } },
      )

      const payload = resp.data as any

      const items: Product[] = payload.results ?? payload

      setData(items)
      setTotal(payload.count ?? items.length)
    } catch (err) {
      console.error('Failed to load products', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts(page)
  }, [page])

  const columns: ColumnsType<Product> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 120,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: 'Stock',
      dataIndex: 'stock',
      key: 'stock',
      width: 120,
      render: (value: number) => {
        const isLow = value <= 5
        return (
          <Tag color={isLow ? 'red' : 'green'}>
            {value}
          </Tag>
        )
      },
    },
  ]

  return (
    <Table<Product>
      rowKey="id"
      columns={columns}
      dataSource={data}
      loading={loading}
      pagination={{
        current: page,
        total,
        pageSize: 10,
        onChange: (p) => setPage(p),
      }}
    />
  )
}

export default ProductList
