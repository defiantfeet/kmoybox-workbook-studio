import Link from 'next/link';
import type { WorkbookLink } from '../lib/model';

export function WorkbookConnection({ label, links, value = '', onChange }: {
  label: string; links: WorkbookLink[]; value?: string | null; onChange?: (value: string) => void;
}) {
  const linked = links.find(item => item.ref === value);
  return <div className="workbook-connection">
    <label>{label}<select name="workbook_ref" {...(onChange ? { value: value ?? '', onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value) } : { defaultValue: value ?? '' })}>
      <option value="">No connection</option>
      {value && !linked && <option value={value}>Previously linked exercise unavailable</option>}
      {links.map(item => <option key={item.ref} value={item.ref}>{item.label}</option>)}
    </select></label>
    {linked && <Link className="text-button" href={linked.href}>Open linked workbook exercise</Link>}
  </div>;
}
