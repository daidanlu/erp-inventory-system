import React, { useMemo, useState } from 'react';
import { Modal, Input, Typography, message } from 'antd';
import axios from 'axios';

const { Text } = Typography;

type ProductLite = {
  id: number;
  sku: string;
  stock: number;
};

type ProductListResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

function normalizeList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const obj = data as any;
  if (Array.isArray(obj?.results)) return obj.results as T[];
  return [];
}

function formatDrfError(data: any): string {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    const parts = data.map((x) => formatDrfError(x)).filter(Boolean);
    return parts.join(' | ');
  }
  if (typeof data === 'object') {
    if (data.detail) return String(data.detail);
    const parts = Object.entries(data).map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: ${v.map(String).join(', ')}`;
      if (typeof v === 'object' && v) return `${k}: ${formatDrfError(v)}`;
      return `${k}: ${String(v)}`;
    });
    return parts.join(' | ');
  }
  return String(data);
}

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type ParsedLine = {
  key: string;      // sku or product_id string
  delta: number;    // integer
  lineNo: number;
  raw: string;
};

function parseLines(rawText: string): { parsed: ParsedLine[]; errors: string[] } {
  const lines = rawText.split(/\r?\n/);
  const parsed: ParsedLine[] = [];
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    const line = raw.trim();

    if (!line) continue;
    if (line.startsWith('#')) continue;

    // accept: "SKU,10" | "SKU 10" | "SKU\t10"
    const parts = line.split(/[\t, ]+/).filter(Boolean);
    if (parts.length < 2) {
      errors.push(`Line ${lineNo}: expected "SKU,delta" (got "${raw}")`);
      continue;
    }

    const key = parts[0].trim();
    const deltaStr = parts[1].trim();
    const deltaNum = Number(deltaStr);

    if (!Number.isFinite(deltaNum) || !Number.isInteger(deltaNum)) {
      errors.push(`Line ${lineNo}: delta must be an integer (got "${deltaStr}")`);
      continue;
    }
    if (deltaNum === 0) {
      errors.push(`Line ${lineNo}: delta cannot be 0`);
      continue;
    }

    parsed.push({ key, delta: deltaNum, lineNo, raw });
  }

  return { parsed, errors };
}

function summarizeErrors(errors: string[], max = 6): string {
  if (errors.length <= max) return errors.join('\n');
  return `${errors.slice(0, max).join('\n')}\n...and ${errors.length - max} more error(s).`;
}

const BulkAdjustStockModal: React.FC<Props> = ({ open, onClose, onSuccess }) => {
  const [raw, setRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const lineCount = useMemo(() => {
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#')).length;
  }, [raw]);

  const fetchProductBySku = async (sku: string): Promise<ProductLite | null> => {
    const resp = await axios.get<ProductListResponse<ProductLite> | ProductLite[]>('/api/products/', {
      params: { sku },
    });
    const products = normalizeList<ProductLite>(resp.data);
    if (!products.length) return null;
    const p = products[0];
    return { id: Number(p.id), sku: String(p.sku), stock: Number((p as any).stock ?? 0) };
  };

  const handleOk = async () => {
    setSubmitting(true);
    try {
      const { parsed, errors } = parseLines(raw);

      if (errors.length) {
        message.error(summarizeErrors(errors));
        return;
      }
      if (parsed.length === 0) {
        message.warning('Paste at least one line like: P001,10');
        return;
      }

      // sku cache & fetch concurrently
      const skuSet = new Set<string>();
      for (const item of parsed) {
        if (!/^\d+$/.test(item.key)) skuSet.add(item.key);
      }
      const skuList = Array.from(skuSet);

      const skuToProduct = new Map<string, ProductLite>();
      if (skuList.length) {
        const results = await Promise.allSettled(
          skuList.map(async (sku) => {
            const p = await fetchProductBySku(sku);
            if (!p) throw new Error(`SKU not found: ${sku}`);
            return p;
          })
        );

        const skuErrors: string[] = [];
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const sku = skuList[i];
          if (r.status === 'fulfilled') {
            skuToProduct.set(sku, r.value);
          } else {
            skuErrors.push(String((r.reason as any)?.message ?? `SKU lookup failed: ${sku}`));
          }
        }
        if (skuErrors.length) {
          message.error(summarizeErrors(skuErrors));
          return;
        }
      }


      const fetchProductById = async (id: number): Promise<ProductLite | undefined> => {
        try {
          const resp = await axios.get(`/api/products/${id}/`);
          const p = resp.data;
          return { id: Number(p.id), sku: String(p.sku), stock: Number(p.stock ?? 0) };
        } catch (e: any) {
          if (e?.response?.status === 404) return undefined;
          throw e;
        }
      };

      // aggregate per product_id
      const agg = new Map<number, { delta: number; skuHint?: string; currentStock?: number; lineNos: number[] }>();
      const perLineErrors: string[] = [];
      const idCache = new Map<number, ProductLite>();

      for (const item of parsed) {
        let productId: number | null = null;
        let skuHint: string | undefined;
        let currentStock: number | undefined;

        if (/^\d+$/.test(item.key)) {
          const id = Number(item.key);
          let p = idCache.get(id); // ProductLite | undefined
          if (!p) {
            p = await fetchProductById(id); // ProductLite | undefined
            if (p) idCache.set(id, p);
          }
          if (!p) {
            perLineErrors.push(`Line ${item.lineNo}: product id ${id} does not exist`);
            continue;
          }

          productId = p.id;
          currentStock = p.stock;
        } else {
          skuHint = item.key;
          const p = skuToProduct.get(item.key);
          if (!p) {
            perLineErrors.push(`Line ${item.lineNo}: product not found for "${item.key}"`);
            continue;
          }
          productId = p.id;
          currentStock = p.stock;
        }

        if (!productId) {
          perLineErrors.push(`Line ${item.lineNo}: invalid product identifier "${item.key}"`);
          continue;
        }

        const prev = agg.get(productId) ?? { delta: 0, skuHint, currentStock, lineNos: [] as number[] };
        const nextDelta = prev.delta + item.delta;
        const mergedStock = prev.currentStock ?? currentStock;
        agg.set(productId, {
          delta: nextDelta,
          skuHint: prev.skuHint ?? skuHint,
          currentStock: mergedStock,
          lineNos: [...prev.lineNos, item.lineNo],
        });
      }

      if (perLineErrors.length) {
        message.error(summarizeErrors(perLineErrors));
        return;
      }

      const adjustments = Array.from(agg.entries())
        .map(([product_id, meta]) => ({ product_id, delta: meta.delta, meta }))
        .filter((x) => x.delta !== 0);

      if (adjustments.length === 0) {
        message.warning('All deltas cancelled out to 0; nothing to submit.');
        return;
      }

      // precheck negative stock only when we know current stock (SKU lines)
      const negative = adjustments.find((x) => {
        const cur = x.meta?.currentStock;
        return Number.isFinite(cur) && (cur! + x.delta) < 0;
      });
      if (negative) {
        const cur = negative.meta.currentStock as number;
        const who = negative.meta.skuHint ?? `id=${negative.product_id}`;
        message.error(`Rejected before submit: ${who} would become negative (${cur} + ${negative.delta}).`);
        return;
      }

      const payload = adjustments.map(({ meta, ...body }) => body);
      console.log('[BulkAdjust] parsed=', parsed);
      console.log('[BulkAdjust] payload=', payload);

      await axios.post(
        '/api/products/bulk_adjust_stock/',
        adjustments.map(({ meta, ...body }) => body)
      );

      message.success(`Bulk stock adjustment applied (${adjustments.length} product(s)).`);
      setRaw('');
      onSuccess();
      onClose();
    } catch (err: any) {
      const detail = formatDrfError(err?.response?.data) || err?.message || 'Bulk adjust failed';
      console.error('Bulk adjust failed', err?.response || err);
      message.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Bulk Adjust Stock"
      onOk={handleOk}
      onCancel={onClose}
      okText="Apply"
      confirmLoading={submitting}
      destroyOnClose
    >
      <Text type="secondary">
        Paste lines like <Text code>P001,10</Text> or <Text code>P002,-3</Text>, one per line.{' '}
        Lines starting with <Text code>#</Text> are ignored.
      </Text>
      <Input.TextArea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={10}
        style={{ marginTop: 12 }}
        placeholder={`P001,10\nP002,-3\n# comment line`}
      />
      <div style={{ marginTop: 8 }}>
        <Text type="secondary">{lineCount} line(s) detected.</Text>
      </div>
    </Modal>
  );
};

export default BulkAdjustStockModal;
