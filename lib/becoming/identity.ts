import { z } from 'zod';

export const identityCategories = [
  'Personal values', 'Cultural identity', 'Family roles', 'Professional identity', 'Gender and self-expression',
  'Interests and creativity', 'Strengths', 'Life experiences', 'Community affiliations', 'Societal expectations', 'Future identity',
] as const;

export const identityClassifications = [
  'Personally chosen', 'Inherited', 'Socially assigned', 'Currently exploring', 'No longer identifies with',
] as const;

export const identityPrompts = [
  ['privateSelf', 'Who am I when no one is watching?'],
  ['authentic', 'Which identities feel authentic?'],
  ['restrictive', 'Which labels feel restrictive?'],
  ['retain', 'Which roles do I want to retain?'],
  ['pressure', 'Where do I feel pressure to conform?'],
  ['belonging', 'How can I belong without abandoning myself?'],
] as const;

export const identityActivities = {
  boundary: { label: 'Boundary Builder', slug: 'boundary-builder', field: '0', prompt: 'What situation would you like to set a boundary around?' },
  social: { label: 'Social Integration', slug: 'social-integration', field: '1', prompt: 'What small action might help you feel connected?' },
} as const;
export const maxIdentityNodes = 16;
export const maxIdentityConnections = 40;

const nodes = z.object({
  id: z.uuid(),
  label: z.string().trim().min(1).max(80),
  category: z.union([z.enum(identityCategories), z.literal('')]),
  classification: z.union([z.enum(identityClassifications), z.literal('')]),
}).strict();

export const identitySchema = z.object({
  format: z.literal('identity-v1'),
  nodes: z.array(nodes).max(maxIdentityNodes),
  connections: z.array(z.tuple([z.uuid(), z.uuid()])).max(maxIdentityConnections),
  reflections: z.partialRecord(z.enum(identityPrompts.map(([key]) => key)), z.string().trim().max(2000)),
  earlier: z.array(z.string().max(2000)).max(3).optional(),
}).strict().refine(map => {
  const ids = new Set(map.nodes.map(node => node.id));
  return ids.size === map.nodes.length
    && map.connections.every(([a, b]) => a < b && ids.has(a) && ids.has(b))
    && new Set(map.connections.map(edge => edge.join('/'))).size === map.connections.length;
});

export type IdentityMapData = z.infer<typeof identitySchema>;
export type IdentityNode = IdentityMapData['nodes'][number];
export type IdentityVersion = { id: string; savedAt: string; map: IdentityMapData };
export const emptyIdentity: IdentityMapData = { format: 'identity-v1', nodes: [], connections: [], reflections: {} };

export function readIdentity(input: unknown): IdentityMapData {
  const result = identitySchema.safeParse(input);
  if (result.success) return result.data;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return emptyIdentity;
  const notes = Object.values(input).filter((value): value is string => typeof value === 'string' && Boolean(value)).slice(0, 3);
  return notes.length ? { ...emptyIdentity, earlier: notes } : emptyIdentity;
}

export function compareIdentity(newer: IdentityMapData, older: IdentityMapData) {
  const oldNodes = new Map(older.nodes.map(node => [node.id, node]));
  const newNodes = new Map(newer.nodes.map(node => [node.id, node]));
  const edgeKey = (edge: [string, string]) => edge.join('/');
  const oldEdges = new Set(older.connections.map(edgeKey));
  const newEdges = new Set(newer.connections.map(edgeKey));
  const labels = (map: Map<string, IdentityNode>, edge: [string, string]) => edge.map(id => map.get(id)?.label).join(' and ');
  return {
    added: newer.nodes.filter(node => !oldNodes.has(node.id)).map(node => node.label),
    removed: older.nodes.filter(node => !newNodes.has(node.id)).map(node => node.label),
    changed: newer.nodes.flatMap(node => {
      const before = oldNodes.get(node.id);
      if (!before || before.label === node.label && before.category === node.category && before.classification === node.classification) return [];
      return [{ before, after: node }];
    }),
    connected: newer.connections.filter(edge => !oldEdges.has(edgeKey(edge))).map(edge => labels(newNodes, edge)),
    disconnected: older.connections.filter(edge => !newEdges.has(edgeKey(edge))).map(edge => labels(oldNodes, edge)),
    reflections: identityPrompts.filter(([key]) => (newer.reflections[key] ?? '') !== (older.reflections[key] ?? '')),
  };
}
