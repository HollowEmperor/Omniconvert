import * as yaml from 'js-yaml';
import { marked } from 'marked';

export interface TabularRecord {
  [key: string]: string | number | boolean | null;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function parseCsv(input: string): TabularRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (nonEmpty.length === 0) return [];

  const headers = nonEmpty[0].map((h, idx) => h.trim() || `column_${idx + 1}`);
  return nonEmpty.slice(1).map((r) => {
    const obj: TabularRecord = {};
    headers.forEach((header, idx) => {
      const raw = (r[idx] ?? '').trim();
      if (raw === '') {
        obj[header] = '';
      } else if (raw === 'true') {
        obj[header] = true;
      } else if (raw === 'false') {
        obj[header] = false;
      } else if (!Number.isNaN(Number(raw)) && /^-?\d+(\.\d+)?$/.test(raw)) {
        obj[header] = Number(raw);
      } else {
        obj[header] = raw;
      }
    });
    return obj;
  });
}

export function stringifyCsv(data: unknown): string {
  const rows = normalizeToArray(data);
  if (rows.length === 0) return '';

  const headers = Array.from(
    rows.reduce<Set<string>>((set, item) => {
      Object.keys(item).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );

  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(',')),
  ];
  return lines.join('\n');
}

function normalizeToArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.map((item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : { value: item }
    );
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1 && Array.isArray(obj[keys[0]])) {
      return normalizeToArray(obj[keys[0]]);
    }
    return [obj];
  }
  return [{ value: data }];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeXmlTag(tag: string): string {
  const cleaned = tag.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return /^[a-zA-Z_]/.test(cleaned) ? cleaned : `field_${cleaned}`;
}

export function objectToXml(data: unknown, rootName = 'dataset', pretty = true): string {
  const indentUnit = pretty ? '  ' : '';
  const nl = pretty ? '\n' : '';

  const renderValue = (key: string, value: unknown, depth: number): string => {
    const pad = indentUnit.repeat(depth);
    const tag = sanitizeXmlTag(key);

    if (value === null || value === undefined) {
      return `${pad}<${tag} />`;
    }
    if (Array.isArray(value)) {
      const inner = value.map((item) => renderValue('item', item, depth + 1)).join(nl);
      return `${pad}<${tag}>${nl}${inner}${nl}${pad}</${tag}>`;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return `${pad}<${tag} />`;
      const inner = entries.map(([k, v]) => renderValue(k, v, depth + 1)).join(nl);
      return `${pad}<${tag}>${nl}${inner}${nl}${pad}</${tag}>`;
    }
    return `${pad}<${tag}>${escapeXml(String(value))}</${tag}>`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>${nl}${renderValue(rootName, data, 0)}`;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseSimpleXml(xmlText: string): unknown {
  const stripped = xmlText.replace(/<\?xml[\s\S]*?\?>/gi, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  const rootMatch = stripped.match(/^<([a-zA-Z_][\w.-]*)[^>]*>([\s\S]*)<\/\1>$/);
  if (!rootMatch) {
    throw new Error('Invalid XML structure: expected a single root element.');
  }

  const parseChildren = (content: string): unknown => {
    const trimmed = content.trim();
    if (!trimmed.startsWith('<')) {
      const decoded = decodeXmlEntities(trimmed);
      if (decoded === 'true') return true;
      if (decoded === 'false') return false;
      if (decoded !== '' && /^-?\d+(\.\d+)?$/.test(decoded)) return Number(decoded);
      return decoded;
    }

    const tokenRegex = /<([a-zA-Z_][\w.-]*)(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/\1>)/g;
    const entries: Array<[string, unknown]> = [];
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(trimmed)) !== null) {
      const tag = match[1];
      const inner = match[2];
      entries.push([tag, inner === undefined ? null : parseChildren(inner)]);
    }

    if (entries.length === 0) {
      return decodeXmlEntities(trimmed);
    }

    const allItem = entries.every(([k]) => k === 'item' || k === 'row' || k === 'record');
    if (allItem) {
      return entries.map(([, v]) => v);
    }

    const result: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      if (k in result) {
        const prev = result[k];
        result[k] = Array.isArray(prev) ? [...prev, v] : [prev, v];
      } else {
        result[k] = v;
      }
    }
    return result;
  };

  return parseChildren(rootMatch[2]);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function dataToHtmlTable(data: unknown, title = 'Converted Data'): string {
  const rows = normalizeToArray(data);
  const headers = Array.from(
    rows.reduce<Set<string>>((set, item) => {
      Object.keys(item).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );

  const thead = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const tbody = rows
    .map(
      (r) =>
        `<tr>${headers
          .map((h) => `<td>${escapeHtml(r[h] === undefined || r[h] === null ? '' : String(r[h]))}</td>`)
          .join('')}</tr>`
    )
    .join('\n      ');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; margin: 32px; background: #fff; }
    h1 { font-size: 20px; margin-bottom: 16px; }
    table { border-collapse: collapse; width: 100%; font-size: 14px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
    th { background: #f8fafc; font-weight: 600; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <table>
    <thead><tr>${thead}</tr></thead>
    <tbody>
      ${tbody}
    </tbody>
  </table>
</body>
</html>`;
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr|br)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function convertStructuredData(
  sourceExt: string,
  targetExt: string,
  content: string,
  options: { prettyPrint?: boolean; title?: string } = {}
): string {
  const pretty = options.prettyPrint !== false;
  let parsed: unknown;

  switch (sourceExt) {
    case 'json':
      parsed = JSON.parse(content);
      break;
    case 'csv':
      parsed = parseCsv(content);
      break;
    case 'yaml':
      parsed = yaml.load(content);
      break;
    case 'xml':
      parsed = parseSimpleXml(content);
      break;
    default:
      throw new Error(`Unsupported structured data source: ${sourceExt}`);
  }

  switch (targetExt) {
    case 'json':
      return JSON.stringify(parsed, null, pretty ? 2 : 0);
    case 'csv':
      return stringifyCsv(parsed);
    case 'yaml':
      return yaml.dump(parsed, { indent: 2, lineWidth: 100 });
    case 'xml':
      return objectToXml(parsed, 'dataset', pretty);
    case 'html':
      return dataToHtmlTable(parsed, options.title ?? 'Converted Dataset');
    case 'txt':
      return JSON.stringify(parsed, null, 2);
    default:
      throw new Error(`Unsupported structured data target: ${targetExt}`);
  }
}

export function convertDocumentText(
  sourceExt: string,
  targetExt: string,
  content: string,
  title = 'Converted Document'
): string {
  if (sourceExt === 'md' && targetExt === 'html') {
    const rendered = marked.parse(content, { async: false }) as string;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 72ch; margin: 40px auto; padding: 0 20px; color: #0f172a; }
    code { background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-family: monospace; }
    pre { background: #f8fafc; padding: 14px; border: 1px solid #e2e8f0; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
${rendered}
</body>
</html>`;
  }

  if (sourceExt === 'txt' && targetExt === 'html') {
    const paragraphs = content
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
      .join('\n');
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>body { font-family: system-ui, sans-serif; line-height: 1.65; max-width: 72ch; margin: 40px auto; padding: 0 20px; color: #0f172a; }</style>
</head>
<body>
${paragraphs}
</body>
</html>`;
  }

  if (sourceExt === 'html' && (targetExt === 'txt' || targetExt === 'md')) {
    return stripHtmlToText(content);
  }

  if (sourceExt === 'md' && targetExt === 'txt') {
    return content
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  }

  if (sourceExt === 'txt' && targetExt === 'md') {
    return content;
  }

  throw new Error(`Unsupported text conversion: ${sourceExt} to ${targetExt}`);
}
